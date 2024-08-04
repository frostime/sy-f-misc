import type FMiscPlugin from "@/index";
import { openCustomTab } from "@/libs/open-tab";
import { IMenuBaseDetail } from "siyuan";
import { renderView } from "./render";
import { IWebApp } from "./utils/types";

let plugin_: FMiscPlugin;

const createApp = (url: string): IWebApp => {
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

const openUrlTab = (e: CustomEvent<IMenuBaseDetail>) => {
    let detail = e.detail;
    let menu = detail.menu;
    const hrefSpan = detail.element;

    console.log(detail);

    let dataHref = hrefSpan.getAttribute("data-href");
    if (!dataHref?.startsWith("http") && !dataHref?.startsWith("www.")) {
        return;
    }

    let destroy: () => void = () => { };

    //encode href
    let uri = encodeURI(dataHref);

    const open = () => {
        openCustomTab(plugin_, {
            id: "webview" + uri,
            render: (container: HTMLElement) => {
                destroy = renderView({
                    element: container,
                    data: createApp(dataHref)
                }, plugin_);
            },
            destroyCb: () => {
                destroy();
            }
        });
    };

    menu.addItem({
        icon: "iconLink",
        label: '在新标签页打开',
        click: open
    });
}

export let name = "WebView";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin_ = plugin;
    plugin.eventBus.on('open-menu-link', openUrlTab);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin_ = null;
    plugin.eventBus.off('open-menu-link', openUrlTab);
}