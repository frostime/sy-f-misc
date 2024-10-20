/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-04 21:23:19
 * @FilePath     : /src/func/mini-window.ts
 * @LastEditTime : 2024-10-20 16:59:24
 * @Description  : 
 */
/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-04 21:23:19
 * @FilePath     : /src/func/mini-window.ts
 * @LastEditTime : 2024-06-23 18:23:27
 * @Description  : 「网页视图」插件中打开小窗口的功能
 * @Open Source  : 摘抄自「网页视图」插件
 */
// import type FMiscPlugin from '@/index';
import { openWindow } from "siyuan";
import { updateStyleDom } from "@/utils/style";


export const declareToggleEnabled = {
    title: '🖥️ 中键小窗',
    description: '启用中键点击元素打开独立小窗功能',
    defaultEnabled: true
};


const InMiniWindow = () => {
    const body: HTMLElement = document.querySelector('body');
    return body.classList.contains('body--window');
}

const pos = (loc: number, size: number) => {
    return Math.max(loc - size / 2, 0);
}

const openSiyuanWindow = (
    id: BlockId,
    e?: MouseEvent
): void => {
    openWindow({
        position: {
            x: pos(e?.x || 0, 750),
            y: pos(e?.y || 0, 500),
        },
        height: 500,
        width: 750,
        doc: {
            id: id
        }
    });
}

const id = 'f-misc__min-win';
const StyleHide = `
.fn__flex.layout-tab-bar {
    display: none;
}
#status {
    display: none;
}
.item--readonly > span.block__icon[data-type] {
    display: none;
}
.protyle-breadcrumb, .protyle-top {
    display: none;
}
.layout-tab-bar--readonly {
    height: 30px;
}
.toolbar__window {
    zoom: 0.75;
    opacity: 0;
}
#tooltip {
    transform: scale(0.5);
}
.toolbar__window:hover {
    opacity: 1;
}

.layout-tab-bar {
    border-bottom: unset;
}

[data-type="wnd"]>div.fn__flex::before {
    content: "{{title}}";
    font-size: 17px;
    font-weight: bold;
    opacity: 0.4;
    position: relative;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
}

`;

const StyleHideAtFullscreen = `
.protyle.fullscreen {
    & .protyle-breadcrumb__bar,
    & button[data-type] {
        display: none;
    }
}

`;

export let name = 'MiniWindow';
export let enabled = false;

export function load() {

    if (enabled) return;

    document.addEventListener('mousedown', onMouseClick);
    enabled = true;

    if (InMiniWindow()) {
        updateStyleDom(id, StyleHideAtFullscreen);
        // plugin.addCommand({
        //     langKey: 'fmisc::hidebar',
        //     langText: `Toggle 小窗隐藏模式`,
        //     hotkey: '⌥⇧H',
        //     callback: () => {
        //         if (document.getElementById(id)) {
        //             removeStyleDom(id);
        //         } else {
        //             let title = document.querySelector('.layout-tab-bar li.item--focus>.item__text').textContent;
        //             updateStyleDom(id, StyleHide.replace('{{title}}', title));
        //         }
        //     }
        // })
    }
}

export function unload() {
    if (!enabled) return;
    document.removeEventListener('mousedown', onMouseClick);
    enabled = false;
    // plugin.delCommand('fmisc::hidebar');
}


const onMouseClick = (e: MouseEvent) => {
    //中键点击
    if (e.button !== 1) {
        return;
    }
    const blockId = getBlockID(e);
    if (blockId) {
        e.preventDefault();
        e.stopPropagation();
        openSiyuanWindow(blockId, e);
    }
}

// Frome https://github.com/Zuoqiu-Yingyi/siyuan-packages-monorepo/blob/main/workspace/packages/utils/regexp/index.ts
const Regex = {
    id: /^\d{14}-[0-9a-z]{7}$/, // 块 ID 正则表达式
    url: /^siyuan:\/\/blocks\/(\d{14}-[0-9a-z]{7})/, // 思源 URL Scheme 正则表达式
}

/**
 * From https://github.com/Zuoqiu-Yingyi/siyuan-packages-monorepo/blob/main/workspace/packages/utils/siyuan/dom.ts
 * 查询块 ID
 * @param e: 事件
 * @return: 块 ID
 */
export function getBlockID(e: Event): BlockId | void {
    const path = e.composedPath();
    for (let i = 0; i < path.length; ++i) {
        const dataset = (path[i] as HTMLElement).dataset;
        if (dataset) {
            switch (true) {
                case dataset.nodeId && Regex.id.test(dataset.nodeId):
                    return dataset.nodeId;
                case dataset.id && Regex.id.test(dataset.id):
                    return dataset.id;
                case dataset.oid && Regex.id.test(dataset.oid):
                    return dataset.oid;
                case dataset.avId && Regex.id.test(dataset.avId):
                    return dataset.avId;
                case dataset.colId && Regex.id.test(dataset.colId):
                    return dataset.colId;
                case dataset.rootId && Regex.id.test(dataset.rootId):
                    return dataset.rootId;

                default:
                    break
            }
        }
    }
    return;
}
