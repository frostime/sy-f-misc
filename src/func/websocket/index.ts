/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-10 15:35:35
 * @FilePath     : /src/func/websocket/index.ts
 * @LastEditTime : 2024-12-19 01:43:34
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import WebSocketManager from "./ws-manager";
import { appendBlock, request } from "@/api";
import { formatSiYuanDate } from "@frostime/siyuan-plugin-kits";

import { openTab, openWindow } from "siyuan";
import { html2ele } from "@frostime/siyuan-plugin-kits";


/**
 * 把 text 添加到我的 dailynote 快记当中
 * @param text 
 * @returns 
 */
const appendDnList = async (text: string) => {

    const refreshDocument = () => {
        let docId = blocks[0].root_id;
        let title = document.querySelector(`.protyle-title[data-node-id="${docId}"]`);
        const protyle = title?.closest('div.protyle');
        if (!protyle) return;
        const dataId = protyle?.getAttribute('data-id');
        let tabHeader = document.querySelector(`li[data-type="tab-header"][data-id="${dataId}"]`);
        let closeEle = tabHeader?.querySelector('span.item__close') as HTMLSpanElement;
        closeEle?.click();
        setTimeout(() => {
            openTab({
                app: webSocketManager.plugin.app,
                doc: {
                    id: docId,
                }
            })
        }, 0); //关闭再打开，以刷新文档内容
    }

    let name = 'custom-dn-quicklist';

    let today = new Date();
    let year = today.getFullYear();
    let month = (today.getMonth() + 1).toString().padStart(2, '0');
    let day = today.getDate().toString().padStart(2, '0');
    let v = `${year}${month}${day}`; // 20240710

    let blocks: Block[] = await globalThis.Query.attr(name, v);
    if (blocks.length !== 1) return;
    let id = blocks[0].id;

    let hours = today.getHours().toString().padStart(2, '0');
    let minutes = today.getMinutes().toString().padStart(2, '0');
    let seconds = today.getSeconds().toString().padStart(2, '0');
    let timestr = `${hours}:${minutes}:${seconds}`; // 12:10:10

    text = text.trim();
    //将所有 _new_line_ 替换为 \n
    text = text.replaceAll('_new_line_', '\n');

    let multiBlocks = text.split('\n\n');
    let firstPara = multiBlocks[0];
    let ans = await appendBlock('markdown', `- [${timestr}] ${firstPara}`, id);

    // console.log(ans);
    if (multiBlocks.length !== 1) {
        const html: string = ans[0].doOperations[0].data;
        const ele = html2ele(html).firstChild as HTMLElement;
        let liId = (ele.querySelector('div.li') as HTMLElement).getAttribute('data-node-id');

        //如果还有多余的段落，则继续添加
        multiBlocks = multiBlocks.slice(1);
        let markdown = multiBlocks.join('\n\n');
        // console.log(liId, markdown);
        await appendBlock('markdown', markdown, liId);
    }
    refreshDocument();
}


const appendDnH2 = async (title: string) => {
    let date = formatSiYuanDate(new Date());
    const attr = `custom-dailynote-${date}`;
    const boxLife = '20220305173526-4yjl33h';
    let docs: Block[] = await globalThis.Query.attr(attr, date);
    docs = docs.filter(b => b.box === boxLife);
    if (docs.length !== 1) return;

    let ans = await appendBlock('markdown', `## ${title}`, docs[0].id);
    if (ans.length === 0) return;
    let doOp = ans[0].doOperations;
    if (doOp.length === 0) return;
    let id = doOp[0].id;

    let width = 800;
    let height = 500;
    let x = (window.screen.width - width) / 2;
    let y = (window.screen.height - height) / 2 - 100;
    openWindow({
        position: {
            x: x,
            y: y
        },
        height: height,
        width: width,
        doc: {
            id: id
        }
    });
}


export let name = "WebSocket";
export let enabled = false;

export const declareToggleEnabled = {
    title: '💬 WebSocket',
    description: '启用 WebSocket 功能',
    defaultEnabled: false
};

let webSocketManager: WebSocketManager | null = null;

export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    //检查 body class 中是否有 body--window
    const body = document.body;
    if (body.classList.contains('body--window')) {
        console.warn(`F-Misc::WebSocket 不在 SiYuan mini windows 中运行.`);
        return;
    }

    let info = await request('/api/broadcast/getChannelInfo', { name: plugin.name });
    if (info.channel?.count > 0) {
        console.info('已经存在 Web Socket 服务，无需重复连接.')
        console.log(info.channel);
        return;
    }

    webSocketManager = new WebSocketManager(plugin, { 
        reconnectInterval: 5000, maxReconnectAttempts: 10
    });
    webSocketManager.createWebSocket();

    webSocketManager.registerMessageHandler('dn-quicklist', appendDnList)
    webSocketManager.registerMessageHandler('dn-h2', appendDnH2)
}

export const unload = () => {
    if (!enabled) return;
    enabled = false;
    if (webSocketManager) {
        webSocketManager.unload();
        webSocketManager = null;
    }
}

export const getAlive = () => {
    let alive = webSocketManager?.isOpen() ?? false;
    return alive;
}
