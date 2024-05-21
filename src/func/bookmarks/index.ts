/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-19 21:52:48
 * @FilePath     : /src/func/bookmarks/index.ts
 * @LastEditTime : 2024-05-21 22:36:01
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import BookmarkDataModel from "./model";
// import { Bookmark } from "./component";
import Bookmark from "./components/bookmark.svelte";
import { insertStyle, removeStyle } from "@/utils/style";

let bookmark: Bookmark;
let model: BookmarkDataModel;

const initBookmark = async (ele: HTMLElement, plugin: FMiscPlugin) => {
    bookmark = new Bookmark({
        target: ele,
        props: {
            plugin: plugin,
            model: model
        }
    });
    insertStyle('hide-bookmark', `
    .dock span[data-type="bookmark"] {
        display: none;
    }
    `);
};

const destroyBookmark = () => {
    bookmark?.$destroy();
    bookmark = null;
    model = null;
    removeStyle('hide-bookmark');
};

export let name = "CustomBookmark";
export let enabled = false;
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;

    model = new BookmarkDataModel(plugin);

    await model.load();

    console.log('model', model);

    plugin.addDock({
        type: '::dock::' + 'Bookmark',
        config: {
            position: 'RightBottom',
            size: {
                width: 200,
                height: 200,
            },
            icon: 'iconBookmark',
            title: 'F-Bookmark'
        },
        data: {
            plugin: plugin,
            initBookmark: initBookmark,
        },
        init() {
            this.data.initBookmark(this.element, this.data.plugin);
            // initBookmark(this.element, plugin);
        }
    })
    enabled = true;
}

export const unload = async () => {
    if (!enabled) return;
    enabled = false;
    await model.save();
    destroyBookmark();
}
