import * as SiYuan from "siyuan";


import { appendBlock, request } from "@/api";
import { searchAttr, formatSiYuanDate, thisPlugin } from "@frostime/siyuan-plugin-kits";

import { openTab, openWindow } from "siyuan";
// import { html2ele } from "@frostime/siyuan-plugin-kits";
import { importJavascriptFile } from "@frostime/siyuan-plugin-kits";
import { createJavascriptFile } from "@frostime/siyuan-plugin-kits";

import { openQuickDraft } from "../quick-draft";
import { startEntry } from "../toggl/state";


const superBlock = (content: string) => {

    return `
{{{row

${content}

}}}
{: style="border: 1px solid var(--b3-border-color);" }


{: type="p" }
`.trim();

}

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
    const isMultiline = text.includes('\n\n');
    let content = isMultiline ? superBlock(`[${timestr}] ${text}`) : `[${timestr}] ${text}`;
    await appendBlock('markdown', content, id);
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
     * @param {require('siyuan').Plugin} context.plugin - Plugin instance
     * @param {typeof require('siyuan')} context.siyuan - SiYuan API instance
     * @param {(url: string, data: any) => Promise<any>} context.request - Kernal request, return response.data or null
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
