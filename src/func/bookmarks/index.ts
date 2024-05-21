/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-19 21:52:48
 * @FilePath     : /src/func/bookmarks/index.ts
 * @LastEditTime : 2024-05-21 23:37:48
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
};

const destroyBookmark = () => {
    bookmark?.$destroy();
    bookmark = null;
    model = null;
    const ele = document.querySelector('span[data-type="sy-f-misc::dock::Bookmark"]') as HTMLElement;
    ele?.remove();
    removeStyle('hide-bookmark');
};

const bookmarkKeymap = window.siyuan.config.keymap.general.bookmark;

export let name = "CustomBookmark";
export let enabled = false;
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;

    model = new BookmarkDataModel(plugin);

    await model.load();

    insertStyle('hide-bookmark', `
    .dock span[data-type="bookmark"] {
        display: none;
    }
    `);

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
    });
    bookmarkKeymap.custom = '';
    plugin.addCommand({
        langKey: 'F-Misc::Bookmark',
        langText: 'F-misc 书签',
        hotkey: bookmarkKeymap.custom,
        callback: () => {
            const ele = document.querySelector('span[data-type="sy-f-misc::dock::Bookmark"]') as HTMLElement;
            ele?.click();
        }
    });

    enabled = true;
}

export const unload = async () => {
    if (!enabled) return;
    enabled = false;
    await model.save();
    destroyBookmark();

    bookmarkKeymap.custom = bookmarkKeymap.default;
}
