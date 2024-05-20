import type FMiscPlugin from "@/index";

const StorageNameBookmarks = 'bookmarks';

export default class BookmarkDataModal {
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

    newGroup(name: string) {
        //6位 36进制
        let id = Math.random().toString(36).slice(-6);
        let group = {
            id,
            name,
            items: [],
            order: 0
        };
        this.bookmarks.set(id, group);
        return group;
    }

    addItem(gid: TBookmarkGroupId, item: IBookmarkItem) {
        let group = this.bookmarks.get(gid);
        if (group) {
            item.order = item?.order ?? 0;
            group.items.push(item);
            return true;
        } else {
            return false;
        }
    }

    delItem(gid: TBookmarkGroupId, id: BlockId) {
        let group = this.bookmarks.get(gid);
        if (group) {
            group.items = group.items.filter(item => item.id !== id);
            return true;
        } else {
            return false;
        }
    }

}
