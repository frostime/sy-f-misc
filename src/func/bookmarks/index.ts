import type FMiscPlugin from "@/index";
import BookmarkDataModal from "./modal";
import { Bookmark } from "./component";

let bookmark: Bookmark;

export let name = "CustomBookmark";
export let enabled = false;
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;

    let modal = new BookmarkDataModal(plugin);
    bookmark = new Bookmark(modal);

    await modal.load();

    plugin.addDock({
        type: '::dock::' + 'Bookmark',
        config: {
            position: 'RightBottom',
            size: {
                width: 200,
                height: 200,
            },
            icon: 'iconEmoji',
            title: 'F-Bookmark'
        },
        data: {
            plugin: plugin,
        },
        init() {
            bookmark.render(this.element);
        }
    })
    enabled = true;
}

export const unload = async () => {
    if (!enabled) return;
    enabled = false;
    await bookmark.modal.save();
    bookmark.modal = null;
    bookmark = null;
}
