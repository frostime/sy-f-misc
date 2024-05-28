// import { writable } from "svelte/store";

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


export class BookmarkDataModel {
    plugin: FMiscPlugin;
    bookmarks: Map<TBookmarkGroupId, IBookmarkGroup>;

    constructor(plugin: FMiscPlugin) {
        this.plugin = plugin;
        this.bookmarks = new Map();
    }

    async load() {
        let bookmarks = await this.plugin.loadData(StorageNameBookmarks + '.json');
        this.plugin.data.bookmarks = bookmarks ?? {};
        for (let [id, group] of Object.entries(this.plugin.data.bookmarks)) {
            this.bookmarks.set(id, group);
        }
    }

    async save() {
        this.plugin.data.bookmarks = Object.fromEntries(this.bookmarks);
        await this.plugin.saveData(StorageNameBookmarks + '.json', this.plugin.data.bookmarks);
    }

    listGroups(visible: boolean = true): IBookmarkGroup[] {
        // 1. sort
        let groups = Array.from(this.bookmarks.values());
        groups.sort((a, b) => a.order - b.order);
        //2. filter
        if (visible) {
            groups = groups.filter(group => !group.hidden);
        }
        return groups;
    }

    newGroup(name: string) {
        //6位 36进制
        let id: TBookmarkGroupId;
        while (id === undefined || this.bookmarks.has(id)) {
            id = Math.random().toString(36).slice(-6);
        }
        let group = {
            id,
            name,
            items: [],
            order: 0
        };
        this.bookmarks.set(id, group);
        this.save();
        return group;
    }

    delGroup(id: TBookmarkGroupId) {
        if (this.bookmarks.has(id)) {
            this.bookmarks.delete(id);
            this.save();
            return true;
        } else {
            return false;
        }
    }

    renameGroup(id: TBookmarkGroupId, name: string) {
        let group = this.bookmarks.get(id);
        if (group) {
            group.name = name;
            this.save();
            return true;
        } else {
            return false;
        }
    }

    addItem(gid: TBookmarkGroupId, item: IBookmarkItem) {
        let group = this.bookmarks.get(gid);
        if (group) {
            item.order = item?.order ?? 0;
            group.items.push(item);
            this.save();
            return true;
        } else {
            return false;
        }
    }

    delItem(gid: TBookmarkGroupId, id: BlockId) {
        let group = this.bookmarks.get(gid);
        if (group) {
            group.items = group.items.filter(item => item.id !== id);
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

