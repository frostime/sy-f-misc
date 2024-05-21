import type FMiscPlugin from "@/index";

const StorageNameBookmarks = 'bookmarks';

export default class BookmarkDataModel {
    plugin: FMiscPlugin;
    bookmarks: Map<TBookmarkGroupId, IBookmarkGroup>;

    constructor(plugin: FMiscPlugin) {
        this.plugin = plugin;
        this.bookmarks = new Map();
    }

    async load() {
        await this.plugin.loadData(StorageNameBookmarks);
        let bookmarks = this.plugin.data.bookmarks ?? {};
        for (let [id, group] of Object.entries(bookmarks)) {
            this.bookmarks.set(id, group);
        }
    }

    async save() {
        this.plugin.data.bookmarks = Object.fromEntries(this.bookmarks);
        await this.plugin.saveData(StorageNameBookmarks, this.plugin.data.bookmarks);
    }

    listGroups(visible: boolean = true): IBookmarkGroup[]{
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
