/*
 * Copyright (c) 2024 by zxhd863943427, frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-08 15:00:37
 * @FilePath     : /src/func/data-query.ts
 * @LastEditTime : 2024-07-23 21:51:47
 * @Description  :
 *      - Fork from project https://github.com/zxhd863943427/siyuan-plugin-data-query
 *      - 基于该项目的 v0.0.7 版本进行修改
 */
// import type FMiscPlugin from "@/index";
import {
    IProtyle,
    fetchSyncPost,
    Lute
} from "siyuan";
import { ILute, setLute } from "@/utils/lute";

let lute: ILute = null;

/**************************************** 重构几个默认显示组件 ****************************************/


class List {
    element: HTMLElement;
    //嵌套列表
    dataList: any[];

    constructor(options: { target: HTMLElement, dataList: any[] }) {
        this.element = options.target;
        this.dataList = options.dataList;
        this.render();
    }

    render() {
        const dataList = this.dataList;
        const trimList = dataList.map(x => "* " + x.toString());
        const mdStr = trimList.join("\n");
        const html = lute.Md2BlockDOM(mdStr);

        this.element.innerHTML = `<div>${html}</div>`;
    }
}

class Table {
    element: HTMLElement;
    tableData: any[][];
    private center: boolean;

    constructor(options: { target: HTMLElement, tableData: any[][], center?: boolean }) {
        this.element = options.target;
        this.tableData = options.tableData;
        this.center = options?.center ?? false;
        this.render();
    }

    render() {
        const tableData  = this.tableData;
        const headerRow = tableData[0].map(header => `<th>${lute.InlineMd2BlockDOM(`${header}`)}</th>`).join('');
        const bodyRows = tableData.slice(1).map(row => {
            const rowItems = row.map(rowItem => `<td>${lute.InlineMd2BlockDOM(`${rowItem}`)}</td>`).join('');
            return `<tr>${rowItems}</tr>`;
        }).join('');

        const tableHtml = `
            <table class="query-table" style="max-width: 100%; ${this.center ? 'margin: 0 auto;' : ''}">
                <thead>
                    <tr>${headerRow}</tr>
                </thead>
                <tbody>${bodyRows}</tbody>
            </table>
        `;

        this.element.innerHTML = tableHtml;
    }
}

const renderProps = (b: Block, prop: keyof Block, options?: {
    onlyDate?: boolean;
    onlyTime?: boolean;
}) => {
    let v: string | number = '';

    const link = (title: string, id: BlockId) => `[${title}](siyuan://blocks/${id})`;
    const parseTime = (dt: string) => {
        let date = sy2Date(dt);
        if (options?.onlyDate) {
            return formatDateTime('yyyy-MM-dd', date);
        } else if (options?.onlyTime) {
            return formatDateTime('HH:mm:ss', date);
        } else {
            return formatDateTime('yyyy-MM-dd HH:mm:ss', date);
        }
    }

    const docName = () => {
        let hpath = b.hpath;
        let idx = hpath.lastIndexOf('/');
        let docname = hpath.substring(idx + 1);
        return docname;
    }

    switch (prop) {
        case 'type':
            const type = BlockTypeShort[b.type];
            v = link(type, b.id);
            break;

        case 'id':
            v = link(b.id, b.id);
            break;

        case 'root_id':
            v = link(docName(), b.root_id);
            break;

        case 'hpath':
            v = link(b.hpath, b.root_id);
            break;

        case 'content':
            v = b.fcontent || b.content
            break;

        case 'box':
            let notebook = getNotebook(b.box);
            v = notebook.name;
            break;

        case 'updated':
        case 'created':
            v = parseTime(b[prop]);
            break;
    
        default:
            v = b[prop];
            break;
    }
    return v;
}

class BlockTable extends Table {
    constructor(options: { target: HTMLElement, blocks: Block[], center?: boolean, col?: (keyof Block)[] }) {
        let cols = options?.col ?? ['type', 'content', 'root_id', 'box', 'created'];
        let tables: ((string | number)[])[] = [cols];
        options.blocks.forEach((b: Block) => {
            let rows = cols.map(c => renderProps(b, c));
            tables.push(rows);
        });
        super({...options, tableData: tables})
    }
}

/**************************************** ZX写的 DataView 类 ****************************************/


function cancelKeyEvent(el: KeyboardEvent) {
    let nodeElement: HTMLElement = document.getSelection().getRangeAt(0).startContainer.parentElement;
    if (hasParentWithClass(nodeElement, "data-query-embed")) {
        el.stopPropagation();
    }
}

function hasParentWithClass(element: HTMLElement, className: string) {
    // 获取父元素
    let parent = element.parentElement;
    // 通过while循环遍历父元素
    while (parent && !parent.classList.contains('protyle-wysiwyg--attr')) {
        // 检查父元素是否包含指定class
        if (parent.classList.contains(className)) {
            return true;
        }
        // 继续向上获取父元素
        parent = parent.parentElement;
    }
    return false;
}

export class DataView {
    private protyle: IProtyle;
    private item: HTMLElement;
    private top: number | null;
    private lute: Lute;
    element: HTMLElement;
    ele: WeakRef<HTMLElement>;  //alias for element

    constructor(protyle: IProtyle, item: HTMLElement, top: number | null) {
        this.protyle = protyle;
        this.item = item;
        this.top = top;
        this.element = document.createElement("div");
        this.ele = new WeakRef(this.element);
        this.element.classList.add('data-query-embed');
        this.item.lastElementChild.insertAdjacentElement("beforebegin", this.element);
        this.lute = lute;
    }

    addElement(CustomEmbed: HTMLElement | string) {
        const customElem = document.createElement("div");

        if (typeof CustomEmbed === 'string') {
            const html = `<div class="protyle-wysiwyg__embed">${CustomEmbed}</div>`;
            customElem.innerHTML = html;
        }
        else if (CustomEmbed instanceof Element) {
            customElem.appendChild(CustomEmbed);
        }

        this.element.append(customElem);
        return customElem;
    }

    addelement = this.addElement;
    addele = this.addElement;

    addMarkdown(md: string) {
        let elem = document.createElement("div");
        elem.innerHTML = this.lute.Md2BlockDOM(md);
        this.element.append(elem);
        return elem;
    }

    addmd = this.addMarkdown;
    addmarkdown = this.addMarkdown;

    addList(data: any[]) {
        let listContainer = document.createElement("div");
        let list = new List({
            target: listContainer,
            dataList: data
        });
        this.element.append(listContainer);
        return list.element.firstChild as HTMLElement;
    }

    addlist = this.addList;

    addTable(data: any[], center: boolean = false) {
        let tableContainer = document.createElement('div');
        let table = new Table({
            target: tableContainer,
            tableData: data,
            center
        });
        this.element.append(tableContainer);
        return table.element.firstChild as HTMLElement;
    }

    addtable = this.addTable;

    addBlockTable(blocks: Block[], cols?: (keyof Block)[], center?: boolean, ) {
        let tableContainer = document.createElement('div');
        let table = new BlockTable({
            target: tableContainer,
            blocks,
            col: cols,
            center: center ?? true
        });
        this.element.append(tableContainer);
        return table.element.firstChild as HTMLElement;
    }

    addblocktable = this.addBlockTable;

    render() {
        this.protyle.element.addEventListener("keydown", cancelKeyEvent, true);
        const rotateElement = this.item.querySelector(".fn__rotate");

        if (rotateElement) {
            rotateElement.classList.remove("fn__rotate");
        }

        this.element.setAttribute("contenteditable", "false");
        this.element.onmousedown = (el) => { el.stopPropagation(); };
        this.element.onmouseup = (el) => { el.stopPropagation(); };
        this.element.onkeydown = (el) => { el.stopPropagation(); };
        this.element.onkeyup = (el) => { el.stopPropagation(); };
        this.element.oninput = (el) => { el.stopPropagation(); };
        this.element.onclick = (el) => {
            const selection = window.getSelection();
            const length = selection.toString().length;
            if (length === 0 && (el.target as HTMLElement).tagName === "SPAN") {
                return;
            }
            el.stopPropagation();
        };

        if (this.top) {
            // 前进后退定位 https://ld246.com/article/1667652729995
            this.protyle.contentElement.scrollTop = this.top;
        }

        // 确保内部节点不可编辑
        let editableNodeList = this.element.querySelectorAll('[contenteditable="true"]');
        editableNodeList.forEach(node => {
            node.setAttribute('contenteditable', 'false');
        });

        this.item.style.height = "";
        let content = lute.BlockDOM2Content(this.element.innerText).replaceAll('\n', ' ');
        fetchSyncPost('/api/search/updateEmbedBlock', {
            id: this.item.getAttribute("data-node-id"),
            content: content
        });
    }
}

/**************************************** Query 函数 ****************************************/

import { request, sql, listDocsByPath } from "@/api";
import { formatDateTime, sy2Date } from "@/utils/time";
import { BlockTypeShort } from "@/utils/const";
import { getNotebook } from "@/utils";

/**
 * Filter blocks in sql search scenario to eliminate duplicate blocks
 * @param blocks Block[]
 * @param mode uni 模式;
 *  - 'leaf' 只返回叶子节点
 *  - 'root' 只返回根节点
 * @param ret 返回类型, 'block' 返回 Block[], 'id' 返回 BlockId[]
 * @returns BlockId[]
 */
function UniBlocks(blocks: Block[], mode: 'leaf' | 'root' = 'leaf', ret: "block" | "id" ="block") {
    console.log('UniBlocks', blocks);
    let p2c = new Map();
    let blocksMap = new Map();
    blocks.forEach(block => {
        p2c.set(block.parent_id, block.id);
        blocksMap.set(block.id, block);
    });
    let blockIdsResult: BlockId[] = [];
    const pushResult = (block: Block) => {
        if (!blockIdsResult.includes(block.id)) {
            blockIdsResult.push(block.id);
        }
    };
    if (mode === 'root') {
        for (let block of blocks) {
            // 找到 block 最顶层的 parent 节点
            while (blocksMap.has(block.parent_id)) {
                block = blocksMap.get(block.parent_id);
            }
            pushResult(block);
        }
    }
    else if (mode === 'leaf') {
        for (let block of blocks) {
            //如果 block 不在 parent 集合中，则 block 为叶子节点
            if (!p2c.has(block.id)) {
                pushResult(block);
            }
        }
    }
    let retBlocks = blockIdsResult.map(id => blocksMap.get(id));
    return ret === "block" ? retBlocks : retBlocks.map(block => block.id);
}

async function GetBlocksByIDs(...ids: BlockId[]) {
    let idList = ids.map((id) => `"${id}"`);
    let sqlCode = `select * from blocks where id in (${idList.join(",")})`;
    let data = await sql(sqlCode);
    if (!data) {
        return data;
    }
    let dataMap = {};
    for (let block of data) {
        dataMap[block.id] = block;
    }
    return dataMap;
}

/**************************************** Func ****************************************/


export let name = "DataQuery";
export let enabled = false;

export const load = () => {
    if (enabled) return;

    // lute = setLute({});
    globalThis.newDV = (protyle: IProtyle, item: HTMLElement, top: number | null) => {
        if (!lute) {
            lute = setLute({});
        }
        return new DataView(protyle, item, top);
    }
    globalThis.Query = {
        UniBlocks,
        GetBlocksByIDs,
        uniblocks: UniBlocks,
        id2block: GetBlocksByIDs,
        request: request,
        sql: sql,
        cond: async (cond: string) => {
            return sql(`select * from blocks where ${cond}`);
        },
        //查找块的反链
        backlink: async (id: BlockId, limit?: number) => {
            return sql(`
            select * from blocks where id in (
                select block_id from refs where def_block_id = '${id}'
            ) order by updated desc ${limit ? `limit ${limit}` : ''};
            `);
        },
        //查找具有指定属性的 block
        attr: async (name: string, val?: string, valMatch: '=' | 'like' = '=') => {
            return sql(`
            SELECT B.*
            FROM blocks AS B
            WHERE B.id IN (
                SELECT A.block_id
                FROM attributes AS A
                WHERE A.name = '${name}'
                ${val ? `AND A.value ${valMatch} '${val}'` : ''}
            );
            `);
        },
        childdocs: async (b: BlockId | Block) => {
            let block = null;
            if (typeof b === 'string') {
                const _ = await GetBlocksByIDs(b);
                block = _[b];
            } else {
                block = b;
            }
            let data = await listDocsByPath(block.box, block.path);
            let files: any[] = data?.files || [];
            let ids: string[] = files.map(f => f.id);
            let docsMap = await GetBlocksByIDs(...ids);
            return ids.map(id => docsMap[id]);
        },
        /**
         * 处理容器块、段落块嵌套的情况；将容器块的第一个段落块 ID 重定向到容器块 ID
         * @param inputs 
         * @returns 
         */
        fb2p: async (inputs: BlockId[] | Block[]) => {
            let types = typeof inputs[0] === 'string' ? 'id' : 'block';
            let ids = types === 'id' ? inputs as BlockId[] : (inputs as Block[]).map(b => b.id);
            let blocks: Block[] = inputs as Block[];
            if (types == 'id') {
                //@ts-ignore
                blocks = blocks.map(id => ({id: id}));
            }
            let data: {[key: BlockId]: any} = await request('/api/block/getBlockTreeInfos', {
                ids: ids
            });
            let result: Block[] = [];
            for (let block of blocks) {
                result.push(block);
                let info = data[block.id];
                if (info.type !== 'NodeParagraph') continue;
                if (info.previousID !== '') continue;
                if (!['NodeBlockquote', 'NodeListItem'].includes(info.parentType)) continue;
                let resultp = result[result.length - 1];
                resultp.id = info.parentID;
                resultp.type = {'NodeBlockquote': 'b', 'NodeListItem': 'i'}[info.parentType];
            }
            return types === 'block' ? result : result.map(b => b.id);
        },
        b2link: (b: Block) => `[${b.fcontent || b.content}](siyuan://blocks/${b.id})`,
        b2ref: (b: Block) => `((${b.id} '${b.fcontent || b.content}'))`,
        b2id: (...blocks: Block[]) => {
            let ids = blocks.map(b => b.id);
            return ids.length === 1 ? ids[0] : ids;
        }
    }

    enabled = true;
}

export const unload = () => {
    if (!enabled) return;

    lute = null;
    delete globalThis.newDV;
    delete globalThis.Query;

    enabled = false;
}
