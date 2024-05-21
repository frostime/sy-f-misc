/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-19 21:52:48
 * @FilePath     : /src/func/bookmarks/index.ts
 * @LastEditTime : 2024-05-21 20:44:54
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import BookmarkDataModel from "./model";
// import { Bookmark } from "./component";
import Bookmark from "./components/bookmark.svelte";

let bookmark: Bookmark;

export let name = "CustomBookmark";
export let enabled = false;
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;

    let model = new BookmarkDataModel(plugin);

    await model.load();

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
            // bookmark.render(this.element);
            new Bookmark({
                target: this.element,
                props: {
                    plugin: plugin,
                    model: model
                }
            });
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
