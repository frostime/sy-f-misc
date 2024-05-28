import { Writable, writable } from "svelte/store";

import type FMiscPlugin from "@/index";
import { sql, request } from "@/api";
import PromiseLimitPool from "@/utils/promise-pool";

const StorageNameBookmarks = 'bookmarks';

/**
 * 传入若干个 block id, 返回一个对象, key 为 block id, value 为 block
 * @param ids 
 * @returns 
 */
const getBlocks = async (...ids: BlockId[]) => {
    const fmt = `select * from blocks where id in (${ids.map((b) => `'${b}'`).join(',')})`;
    let blocks = await sql(fmt);
    let results: { [key: BlockId]: Block | null } = {};
    for (let id of ids) {
        let block = blocks.find(block => block.id === id);
        if (block) {
            results[id] = block;
        } else {
            results[id] = null;
        }
    }
    return results;
}

interface IDocInfo {
    rootID: DocumentId;
    rootIcon: string;
    rootTitle: string;
    box: string;
}
/**
 * 传入若干个 doc id, 返回一个对象, key 为 doc id, value 为 doc info
 * @param docIds 
 * @returns 
 */
const getDocInfos = async (...docIds: DocumentId[]) => {
    const endpoints = '/api/block/getBlockInfo';
    const pool = new PromiseLimitPool<IDocInfo>(16);
    for (let docId of docIds) {
        pool.add(async () => {
            const result = await request(endpoints, { id: docId });
            return result;
        });
    }
    let results: { [key: DocumentId]: IDocInfo | null } = {};
    try {
        let docInfos = await pool.awaitAll();
        for (let id of docIds) {
            let docInfo = docInfos.find(docInfo => docInfo.rootID === id);
            if (docInfo) {
                results[id] = docInfo;
            } else {
                results[id] = null;
            }
        }
    } catch (error) {
        console.error(error);
    }
    return results;
}

export const ItemInfoStore: { [key: BlockId]: Writable<IBookmarkItemInfo> } = {};

export class BookmarkDataModel {
    plugin: FMiscPlugin;

    groups: Map<TBookmarkGroupId, IBookmarkGroupV2>;
    items: Map<BlockId, IBookmarkItemInfo>; //由于要给 svelte store 使用, 所以用 writable 包装

    constructor(plugin: FMiscPlugin) {
        this.plugin = plugin;
        this.groups = new Map();
        this.items = new Map();
    }

    async load() {
        let bookmarks = await this.plugin.loadData(StorageNameBookmarks + '.json');
        this.plugin.data.bookmarks = bookmarks ?? {};
        for (let [id, group] of Object.entries(this.plugin.data.bookmarks)) {
            //导入的 item v1 声明中没有 order，但存储的数据中可能有
            let items = group.items.map(item => ({ id: item.id, order: item.order ?? 0 }));
            let groupV2: IBookmarkGroupV2 = { ...group, items };
            this.groups.set(id, groupV2);
            group.items.map(item => {
                if (this.items.has(item.id)) {
                    this.items.get(item.id).ref++;
                    return;
                }
                let iteminfo: IBookmarkItemInfo = {
                    id: item.id,
                    title: '',
                    type: 'p',
                    box: '',
                    subtype: '',
                    icon: '',
                    ref: 1
                };
                this.items.set(item.id, iteminfo);
                ItemInfoStore[item.id] = writable({ ...iteminfo });
            });
        }
        this.reorderItems();
    }

    async save() {
        let result: {[key: TBookmarkGroupId]: IBookmarkGroupV2} = {};
        for (let [id, group] of this.groups) {
            // result[id] = this.toGroupV1(group);
            result[id] = group;
        }
        this.plugin.data.bookmarks = result;
        await this.plugin.saveData(StorageNameBookmarks + '.json', this.plugin.data.bookmarks);
    }

    reorderItems(group?: TBookmarkGroupId) {
        const reorder = (group: IBookmarkGroupV2) => {
            return group.items.sort((a, b) => a.order - b.order);
        }
        if (group) {
            let g = this.groups.get(group);
            if (g) {
                reorder(g);
            }
        } else {
            this.groups.forEach(group => {
                reorder(group);
            });
        }
    }

    async updateItems() {
        console.debug('更新所有 Bookmark items');
        //1. 获取所有的 block 的最新内容
        let items = Array.from(this.items.values());
        let ids = items.map(item => item.id);
        let blocks = await getBlocks(...ids);
        //2. 更新文档块的 logo
        let docsItem: DocumentId[] = [];
        Object.values(blocks).forEach(block => {
            if (block?.type === 'd') {
                docsItem.push(block.id);
            }
        });
        let docInfos = await getDocInfos(...docsItem);
        //3. 更新 this.items 和 writable store
        this.items.forEach((item, id) => {
            let block = blocks[id];
            if (block) {
                item.title = block.fcontent || block.content;
                item.box = block.box;
                item.type = block.type;
                item.subtype = block.subtype || '';
                let icon = '';
                if (item.type === 'd') {
                    let docInfo = docInfos[id];
                    if (docInfo) {
                        icon = docInfo.rootIcon;
                    }
                }
                item.icon = icon;
                ItemInfoStore[id].set({ ...item });
            } else {
                console.warn(`block ${id} not found`);
            }
        });
        console.debug('更新所有 Bookmark items 完成');
    }

    /**
     * 上一个版本当中，Group 的类型被标记为 IBookmarkGroupV1, 本函数是在两个版本之间进行转换
     * @param group 
     * @returns 
     */
    private toGroupV1(group: IBookmarkGroupV2): IBookmarkGroupV1 {
        let items: IBookmarkItem[] = group.items.map(itmin => {
            let iteminfo = this.items.get(itmin.id);
            let item = { ...iteminfo };
            delete item.icon;
            delete item.ref;
            return item;
        });
        return { ...group, items };
    }

    listGroups(visible: boolean = true): IBookmarkGroupV2[] {
        // 1. sort
        let groups = Array.from(this.groups.values());
        groups.sort((a, b) => a.order - b.order);
        //2. filter
        if (visible) {
            groups = groups.filter(group => !group.hidden);
        }
        return groups;
    }

    listItems(group?: TBookmarkGroupId) {
        const listItems = (group: IBookmarkGroupV2) => {
            return group.items.map(itmin => this.items.get(itmin.id));
        }
        if (group) {
            let g = this.groups.get(group);
            if (g) {
                return listItems(g);
            } else {
                return [];
            }
        } else {
            let items: IBookmarkItemInfo[] = [];
            this.groups.forEach(group => {
                items.push(...listItems(group));
            });
            return items;
        }
    }

    newGroup(name: string) {
        //6位 36进制
        let id: TBookmarkGroupId;
        while (id === undefined || this.groups.has(id)) {
            id = Math.random().toString(36).slice(-6);
        }
        let group = {
            id,
            name,
            items: [],
            order: 0
        };
        this.groups.set(id, group);
        this.save();
        return group;
    }

    delGroup(id: TBookmarkGroupId) {
        if (this.groups.has(id)) {
            this.groups.delete(id);
            this.save();
            return true;
        } else {
            return false;
        }
    }

    renameGroup(id: TBookmarkGroupId, name: string) {
        let group = this.groups.get(id);
        if (group) {
            group.name = name;
            this.save();
            return true;
        } else {
            return false;
        }
    }

    addItem(gid: TBookmarkGroupId, item: IBookmarkItem) {
        let group = this.groups.get(gid);
        if (group) {
            let exist = this.items.get(item.id) !== undefined;
            if (!exist) {
                let iteminfo = { ...item, icon: '', ref: 0 };
                this.items.set(item.id, iteminfo);
                ItemInfoStore[item.id] = writable({ ...iteminfo });
            }
            group.items.push({
                id: item.id,
                order: 0
            });
            this.items.get(item.id).ref++;
            this.save();
            return true;
        } else {
            return false;
        }
    }

    delItem(gid: TBookmarkGroupId, id: BlockId) {
        let group = this.groups.get(gid);
        if (group) {
            group.items = group.items.filter(item => item.id !== id);
            let item = this.items.get(id);
            if (item) {
                item.ref--;
                if (item.ref === 0) {
                    this.items.delete(id);
                }
            }
            this.save();
            return true;
        } else {
            return false;
        }
    }

}


let model: BookmarkDataModel = null;

export const getModel = (plugin?: FMiscPlugin) => {
    if (model === null && plugin === undefined) {
        throw new Error('model not initialized');
    }
    if (plugin) {
        model = new BookmarkDataModel(plugin);
    }
    return model;
}

export const rmModel = () => {
    model = null;
}

