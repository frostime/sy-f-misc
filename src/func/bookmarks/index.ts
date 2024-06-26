/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-19 21:52:48
 * @FilePath     : /src/func/bookmarks/index.ts
 * @LastEditTime : 2024-06-26 21:44:18
 * @Description  : 
 */
import { render } from "solid-js/web";
import type FMiscPlugin from "@/index";
import { getModel, rmModel, BookmarkDataModel } from "./model";
// import { Bookmark } from "./component";
import Bookmark from "./components/bookmark";
import { updateStyleDom, removeStyleDom } from "@/utils/style";

let model: BookmarkDataModel;

const initBookmark = async (ele: HTMLElement, plugin: FMiscPlugin) => {
    await model.load();
    await model.updateItems();
    ele.classList.add('fn__flex-column');
    render(() => Bookmark({
        plugin: plugin,
        model: model
    }), ele);
};

const destroyBookmark = () => {
    rmModel();
    model = null;
    const ele = document.querySelector('span[data-type="sy-f-misc::dock::Bookmark"]') as HTMLElement;
    ele?.remove();
    removeStyleDom('hide-bookmark');
};

const bookmarkKeymap = window.siyuan.config.keymap.general.bookmark;

export let name = "CustomBookmark";
export let enabled = false;
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;

    model = getModel(plugin);

    //疑似首先 await load 会导致 addDock 无法正常执行
    // await model.load();
    // await model.updateItems();

    updateStyleDom('hide-bookmark', `
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
        }
    });
    bookmarkKeymap.custom = '';
    console.log('bookmarkKeymap', bookmarkKeymap);
    plugin.addCommand({
        langKey: 'F-Misc::Bookmark',
        langText: 'F-misc 书签',
        hotkey: bookmarkKeymap.default,
        callback: () => {
            const ele = document.querySelector('span[data-type="sy-f-misc::dock::Bookmark"]') as HTMLElement;
            ele?.click();
        }
    });

    enabled = true;
}

export const unload = async (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    // await model.save(); //没有必要
    destroyBookmark();

    bookmarkKeymap.custom = bookmarkKeymap.default;
    plugin.commands = plugin.commands.filter((command) => command.langKey !== 'F-Misc::Bookmark');
}
