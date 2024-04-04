/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-04 21:23:19
 * @FilePath     : /src/func/mini-window.ts
 * @LastEditTime : 2024-04-04 22:05:36
 * @Description  : 「网页视图」插件中打开小窗口的功能
 * @Open Source  : 摘抄自「网页视图」插件
 */
import type FMiscPlugin from '@/index';
import { openWindow } from "siyuan";

const openSiyuanWindow = (
    id: BlockId,
    e?: MouseEvent
): void => {
    openWindow({
        position: {
            x: e?.x || 0,
            y: e?.y || 0
        },
        height: 500,
        width: 750,
        doc: {
            id: id
        }
    });
}



export let name = 'MiniWindow';
export let enabled = false;

export function load(plugin?: FMiscPlugin) {

    if (enabled) return;

    document.addEventListener('mousedown', onMouseClick);

    enabled = true;
}

export function unload(plugin?: FMiscPlugin) {
    if (!enabled) return;
    document.removeEventListener('mousedown', onMouseClick);
    enabled = false;
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

