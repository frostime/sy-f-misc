import * as SiYuan from "siyuan";


import { appendBlock, request } from "@/api";
import { searchAttr, formatSiYuanDate, thisPlugin } from "@frostime/siyuan-plugin-kits";

import { openTab, openWindow } from "siyuan";
import { html2ele } from "@frostime/siyuan-plugin-kits";
import { importJavascriptFile } from "@frostime/siyuan-plugin-kits";
import { createJavascriptFile } from "@frostime/siyuan-plugin-kits";

import { openQuickDraft } from "../quick-draft";
import { startEntry } from "../toggl/state";

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
            let plugin = thisPlugin();
            openTab({
                app: plugin.app,
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

    let blocks = await searchAttr(name, v);
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
    let docs = await searchAttr(attr, date);
    docs = docs.filter(b => b.box === boxLife);
    if (docs.length !== 1) return;

    let ans = await appendBlock('markdown', `## ${title}`, docs[0].id);
    if (ans.length === 0) return;
    let doOp = ans[0].doOperations;
    if (doOp.length === 0) return;
    let id = doOp[0].id;

    let width = 800;
    let height = 500;
    // let x = (window.screen.width - width) / 2;
    // let y = (window.screen.height - height) / 2 - 100;
    openWindow({
        // position: {
        //     x: x,
        //     y: y
        // },
        height: height,
        width: width,
        doc: {
            id: id
        }
    });
}


const DEFAULT_CODE = `
const defaultModule = {
    /**
     * @param {string} body - The message body
     * @param {Object} context - The context object
     * @param {import('siyuan').Plugin} context.plugin - Plugin instance
     * @param {typeof import('siyuan')} context.siyuan - SiYuan API instance
     */
    'example': (body, context) => {
        console.log(body, context);
    }
};
export default defaultModule;
`.trimStart();

type FHandler = (body: string, context?: {
    plugin: SiYuan.Plugin,
    siyuan: typeof SiYuan,
    request: typeof request,
}) => void;

export const moduleJsName = 'custom.ws-handlers.js';
const parseCustomHandlerModule = async () => {
    const plugin = thisPlugin();
    const module = await importJavascriptFile(moduleJsName);
    if (!module) {
        createJavascriptFile(DEFAULT_CODE, moduleJsName);
        return;
    }
    const modules: Record<string, FHandler> = module.default;
    Object.entries(modules).forEach(([key, handler]) => {
        modules[key] = (body: any) => {
            handler(body, {
                plugin,
                siyuan: SiYuan,
                request: request
            });
        }
    });
    console.log(modules);
    return modules;
}


export let currentHandlers: Record<string, FHandler> = {};
export const Handlers = async () => {
    const modules = await parseCustomHandlerModule();
    currentHandlers = {
        'dn-quicklist': appendDnList,
        'dn-h2': appendDnH2,
        'quick-draft': openQuickDraft,
        'start-toggl': (text: string) => {
            startEntry({
                description: text,
                force: true
            });
        },
        ...modules
    };
    return currentHandlers;
}
