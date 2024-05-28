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

/**
 * Bookmark item 的 svelte 组件需要的信息
 */
interface IBookmarkItemInfo extends IBookmarkItem {
    icon: string;
    ref: number;
}

/**
 * 仅仅是为了 svelte store 使用
 */
interface IBookmarkItemSvelte {
    id: BlockId;
    title: string;
    icon: string;
}
export const ItemInfoStore: { [key: BlockId]: Writable<IBookmarkItemSvelte> } = {};


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
            let groupV2: IBookmarkGroupV2 = { ...group, items: group.items.map(item => item.id) };
            this.groups.set(id, groupV2);
            group.items.map(item => {
                this.addItem(id, item);
            });
        }
    }

    async save() {
        let result: {[key: TBookmarkGroupId]: IBookmarkGroup} = {};
        for (let [id, group] of this.groups) {
            result[id] = this.toGroupV1(group);
        }
        this.plugin.data.bookmarks = result;
        await this.plugin.saveData(StorageNameBookmarks + '.json', this.plugin.data.bookmarks);
    }

    async updateItems() {
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
                item.subtype = block.subtype;

                let rootIcon = '📄';

                let itemInfo = ItemInfoStore[id];
                itemInfo.set({
                    id, title: item.title, icon: rootIcon 
                });
            }
        });
    }

    /**
     * 上一个版本当中，Group 的类型被标记为 IBookmarkGroupV1, 本函数是在两个版本之间进行转换
     * @param group 
     * @returns 
     */
    private toGroupV1(group: IBookmarkGroupV2): IBookmarkGroup {
        let items: IBookmarkItem[] = group.items.map(id => {
            let iteminfo = this.items.get(id);
            let item = { ...iteminfo };
            delete item.icon;
            delete item.ref;
            return item;
        });
        return { ...group, items };
    }

    listGroups(visible: boolean = true): IBookmarkGroup[] {
        // 1. sort
        let groups = Array.from(this.groups.values());
        groups.sort((a, b) => a.order - b.order);
        //2. filter
        if (visible) {
            groups = groups.filter(group => !group.hidden);
        }
        return groups.map(group => this.toGroupV1(group));
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
            group.items.push(item.id);
            let exist = this.items.get(item.id) !== undefined;
            if (!exist) {
                item.order = item?.order ?? 0;
                let iteminfo = { ...item, icon: '', ref: 0 };
                this.items.set(item.id, iteminfo);
                ItemInfoStore[item.id] = writable({ ...iteminfo });
            }
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
            group.items = group.items.filter(itemId => itemId !== id);
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
    if (plugin === null) {
        model = new BookmarkDataModel(plugin);
    }
    return model;
}

export const rmModel = () => {
    model = null;
}

