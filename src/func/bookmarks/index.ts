import type FMiscPlugin from "@/index";
import { Bookmark } from "./component";

let bookmark: Bookmark;

export let name = "CustomBookmark";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;

    bookmark = new Bookmark();
    bookmark.initBookmarks([
        {
            id: '1',
            name: 'Group 1',
            items: [
                {
                    id: '1',
                    title: 'Item 1',
                    type: 'p'
                }
            ]
        },
        {
            id: '2',
            name: 'Group 2',
            items: [
                {
                    id: '1',
                    title: 'Item 1',
                    type: 'd'
                }
            ]
        }
    ]);

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

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    
    enabled = false;
}