import * as SiYuan from "siyuan";

// import { html2ele } from "@frostime/siyuan-plugin-kits";
import { searchAttr, formatSiYuanDate, thisPlugin, api, formatDateTime } from "@frostime/siyuan-plugin-kits";

import { openWindow, showMessage } from "siyuan";
import { importJavascriptFile } from "@frostime/siyuan-plugin-kits";
import { createJavascriptFile } from "@frostime/siyuan-plugin-kits";

import { openQuickDraft } from "../quick-draft";
import { startEntry } from "../toggl/state";
import { getBlockByID, insertBlock, prependBlock, saveBlob } from "@frostime/siyuan-plugin-kits/api";
import { openai } from "../gpt";

import { userConst } from "../shared-configs";

const { appendBlock, request } = api;

const superBlock = (content: string) => {

    return `
{{{row

${content}

}}}
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
        const protyles = SiYuan.getAllEditor();
        protyles.forEach((protyle) => {
            if (protyle.protyle.block.rootID == docId) {
                return;
            }
            protyle.reload(false);
        });
    }

    let name = 'custom-dn-quickh2';

    let today = new Date();
    let year = today.getFullYear();
    let month = (today.getMonth() + 1).toString().padStart(2, '0');
    let day = today.getDate().toString().padStart(2, '0');
    let v = `${year}${month}${day}`; // 20240710

    let hours = today.getHours().toString().padStart(2, '0');
    let minutes = today.getMinutes().toString().padStart(2, '0');
    let seconds = today.getSeconds().toString().padStart(2, '0');
    let timestr = `${hours}:${minutes}:${seconds}`; // 12:10:10
    text = text.trim();
    const lines = text.split(/\r?\n\r?\n/);
    const isMultiline = lines.length > 1;
    let content = isMultiline ? superBlock(`[${timestr}] ${text}`) : `[${timestr}] ${text}`;

    let blocks = await searchAttr(name, v);
    if (blocks.length !== 1) return;
    let id = blocks[0].id;

    let headChildren = await request('/api/block/getHeadingChildrenIDs', { id: id })
    if (!headChildren || headChildren.length === 0) return;
    const lastChild = headChildren[headChildren.length - 1];
    await insertBlock('markdown', content, null, lastChild, null);
    refreshDocument();
}

//#if [PRIVATE_ADD]
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

/**
 * 快速将摘录保存到文档中
 * @param content 
 */
const saveExcerpt = async (content: string) => {
    content = content.trim();
    const docID = '20220418154352-3fdgff5';
    const titleID = '20220418154453-6b59ylm';

    const addContent = async (content: string) => {
        const title = await getBlockByID(titleID);
        if (title) {
            await insertBlock('markdown', content, null, titleID, null);
            return;
        }
        const doc = await getBlockByID(docID);
        if (doc) {
            await prependBlock('markdown', content, docID);
            return;
        }
        showMessage('无法保存摘录!', -1, 'error');
    }

    const time = formatDateTime();

    // 将连续两个以上的换行符替换为两个
    content = content.replace(/\n{2,}/g, '\n\n');

    // 计算汉字和汉字符号数量
    const hanCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length; // 汉字
    const hanSymbolCount = (content.match(/[\u3000-\u303f\uff00-\uffef]/g) || []).length; // 汉字符号
    const chineseCount = hanCount + hanSymbolCount;

    // 计算英文单词数量 - 使用正则表达式匹配英文单词
    // 使用单词边界符号 \b 确保匹配完整单词
    const englishWordCount = (content.match(/\b[a-zA-Z]+(?:[''-][a-zA-Z]+)*\b/g) || []).length;

    const length = chineseCount + englishWordCount;

    let toSave = '';

    if (length <= 1000) {
        toSave = superBlock(`[${time}] | ${content}`);
        await addContent(toSave);
    } else {
        // 太大了就不放入文档中，而是保存为附件
        const MAX_LENGTH = 1000;
        let formerPart = content.slice(0, MAX_LENGTH);
        const latterPartLength = Math.min(MAX_LENGTH, length - MAX_LENGTH);
        let latterPart = content.slice(-latterPartLength);
        const response = await openai.complete(`<RAW_EXCERPT>${formerPart}\n[中间部分省略]\n${latterPart}</RAW_EXCERPT>`, {
            // 编写系统提示，提取摘要
            systemPrompt: userConst.promptSummarize || `Please extract the main idea of the content within the <RAW_EXCERPT> tags, and generate a title and a summary for it.
- You MUST ONLY output two seperate lines, the first line is the title, the second line is the summary, no other text.
- The title must be accurate and concise, about 15 ~ 70 characters.
- The summary must be accurate and logical, about 150 ~ 600 characters.
- 必须使用中文作为输出!
`,
            stream: false
        });
        let title = '';
        let summary = '';
        if (response?.ok !== false) {
            const lines = response.content.split('\n');
            title = lines[0].trim();
            summary = lines.slice(1).join('\n').trim();
        } else {
            const firstLine = content.trim().split('\n')[0];
            title = firstLine.replace(/\s/g, '').slice(0, 25) + '...';
        }
        // replace invalid file name
        title = title.replace(/[/\\:*?"<>|]/g, '');
        const path = `assets/user/excerpt/${time.replaceAll(':', '_')}-${title}.md`;
        await saveBlob('/data/' + path, `# ${time} - ${title}\n\n${content}`);
        await addContent(superBlock(`[${time}] | [${title}](${path})\n\n> ${summary}`));
    }
}

//#endif

const DEFAULT_CODE = `
const defaultModule = {
    /**
     * @param {string} body - The message body
     * @param {Object} context - The context object
     * @param {require('siyuan').Plugin} context.plugin - Plugin instance
     * @param {typeof require('siyuan')} context.siyuan - SiYuan API instance
     * @param {(url: string, data: any) => Promise<any>} context.request - Kernal request, return response.data or null
     * @param context.api - Wrapped siyuan kernel api
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
    api: typeof api,
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
                request: request,
                api: api
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
        //#if [PRIVATE_ADD]
        'dn-h2': appendDnH2,
        'save-excerpt': saveExcerpt,
        //#endif
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
