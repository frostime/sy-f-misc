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

const newOrderByTime = (): number => {
    const start = '2024-05-28T12:00:00';  //起始时间
    let now = Date.now();
    let diff = now - Date.parse(start);
    return diff;
}

export const ItemInfoStore: { [key: BlockId]: Writable<IBookmarkItemInfo> } = {};

export class BookmarkDataModel {
    plugin: FMiscPlugin;

    groups: Map<TBookmarkGroupId, IBookmarkGroup>;
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
            let items = group.items.map(item => ({ id: item.id, order: item.order }));
            let groupV2: IBookmarkGroup = { ...group, items };
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

    async save(fpath?: string) {
        let result: {[key: TBookmarkGroupId]: IBookmarkGroup} = {};
        for (let [id, group] of this.groups) {
            result[id] = group;
        }
        this.plugin.data.bookmarks = result;
        fpath = fpath ?? StorageNameBookmarks + '.json';
        await this.plugin.saveData(fpath, this.plugin.data.bookmarks);
    }

    hasItem(id: BlockId, groupId?: TBookmarkGroupId) {
        if (groupId === undefined) {
            return this.items.has(id);
        } else {
            let group = this.groups.get(groupId);
            if (group) {
                return group.items.some(item => item.id === id);
            } else {
                return false;
            }
        }
    }

    reorderItems(group?: TBookmarkGroupId) {
        const reorder = (group: IBookmarkGroup) => {
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
        const notebookMap = window.siyuan.notebooks.reduce((acc, notebook) => {
            acc[notebook.id] = notebook;
            return acc;
        }, {});
        this.items.forEach((item, id) => {
            let block = blocks[id];
            if (block) {
                item.title = block.fcontent || block.content;
                item.box = block.box;
                item.type = block.type;
                item.subtype = block.subtype || '';
                item.err = undefined;
                let icon = '';
                if (item.type === 'd') {
                    let docInfo = docInfos[id];
                    if (docInfo) {
                        icon = docInfo.rootIcon;
                    }
                }
                item.icon = icon;
            } else {
                console.warn(`block ${id} not found`);
                if (notebookMap?.[item.box]?.closed === true) {
                    item.title = `笔记本「${notebookMap[item.box].name}」已经关闭`;
                    item.err = 'BoxClosed';
                } else {
                    item.title = `无法找到内容块，可能已经被删除！旧块内容：${JSON.stringify(item)}`;
                    item.err = 'BlockDeleted';
                }
            }
            ItemInfoStore[id].set({ ...item });
        });
        console.debug('更新所有 Bookmark items 完成');
    }

    listGroups(visible: boolean = true): IBookmarkGroup[] {
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
        const listItems = (group: IBookmarkGroup) => {
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
            order: newOrderByTime()
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
            } else if (this.hasItem(item.id, gid)) {
                console.warn(`addItem: item ${item.id} already in group ${gid}`);
                return false;
            }
            group.items.push({
                id: item.id,
                order: newOrderByTime()
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

// const sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// globalThis.updateBookmarkOrder = async () => {
//     for (let [id, group] of model.groups) {
//         group.order = newOrderByTime();
//         console.log(`group ${id} order updated: ${group.order}`);
//         for (let [index, item] of group.items.entries()) {
//             item.order = newOrderByTime();
//             console.log(`   item ${item.id} order updated: ${item.order}`);
//             await sleep(500);
//         }
//     }
//     model.save();
// }


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

