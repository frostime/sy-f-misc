/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-14 22:02:49
 * @FilePath     : /src/func/webview/index.ts
 * @LastEditTime : 2024-12-27 15:16:17
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import { IMenu, IMenuBaseDetail, Plugin } from "siyuan";

import { openCustomTab } from "@frostime/siyuan-plugin-kits";

import { renderView } from "./render";
import { IWebApp } from "./utils/types";
import { CustomApps } from "./app";
import { loadStorage } from "./storage";

let plugin_: Plugin;

const createAppTemplate = (url: string): IWebApp => {
    return {
        name: "WebView",
        iconName: "iconLink",
        iconSvg: "",
        iconSymbolSize: 16,
        title: "WebView",
        url: url,
        debug: false,
        proxy: "",
        referer: "",
        script: "",
        css: "",
        internal: false,
        isTopBar: false,
        topBarPostion: "left",
        openTab: () => { }
    };
}

const openUrl = (app: IWebApp) => {
    let uri = encodeURI(app.url);
    let destroy: () => void = () => { };
    openCustomTab({
        tabId: "webview" + uri,
        icon: app.iconName || undefined,
        title: app.title ?? 'Webview',
        render: (container: HTMLElement) => {
            destroy = renderView({
                element: container,
                data: app
            }, plugin_);
        },
        beforeDestroy: () => {
            destroy();
        },
        plugin: plugin_
    });
}

const openUrlTab = (e: CustomEvent<IMenuBaseDetail>) => {
    let detail = e.detail;
    let menu = detail.menu;
    const hrefSpan = detail.element;

    console.log(detail);

    let dataHref = hrefSpan.getAttribute("data-href");
    if (!dataHref?.startsWith("http") && !dataHref?.startsWith("www.")) {
        return;
    }

    menu.addItem({
        icon: "iconLink",
        label: '在新标签页打开',
        click: () => openUrl(createAppTemplate(dataHref))
    });
}

export let name = "WebView";
export let enabled = false;
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin_ = plugin;
    plugin.eventBus.on('open-menu-link', openUrlTab);

    // Load and merge configurations
    const mergedApps = await loadStorage(plugin);
    CustomApps.length = 0;  // Clear existing apps
    CustomApps.push(...mergedApps);  // Replace with merged apps

    let menus: IMenu[] = CustomApps.map((app => {
        return {
            icon: app.iconName,
            label: app.title,
            click: () => openUrl(app)
        }
    }));

    plugin.registerMenuTopMenu('webview', [
        {
            icon: "iconLink",
            label: '在新标签页打开',
            type: 'submenu',
            submenu: menus
        }
    ])
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin_ = null;
    plugin.eventBus.off('open-menu-link', openUrlTab);
    plugin.unRegisterMenuTopMenu('webview');
}