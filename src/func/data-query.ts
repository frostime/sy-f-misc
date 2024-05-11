/*
 * Copyright (c) 2024 by zxhd863943427, frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-08 15:00:37
 * @FilePath     : /src/func/data-query.ts
 * @LastEditTime : 2024-05-11 17:49:31
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

    constructor(options: { target: HTMLElement, tableData: any[][], center: boolean }) {
        this.element = options.target;
        this.tableData = options.tableData;
        this.center = options.center;
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

import { sql } from "@/api";

/**
 * Filter blocks in sql search scenario to eliminate duplicate blocks
 * @param blocks Block[]
 * @param mode uni 模式;
 *  - 'leaf' 只返回叶子节点
 *  - 'root' 只返回根节点
 * @param para_in_li boolean, 如果为 True 则对在 li 中的 p 节点进行处理
 * @param ret 返回类型, 'block' 返回 Block[], 'id' 返回 BlockId[]
 * @returns BlockId[]
 */
function UniBlocks(blocks: Block[], mode: 'leaf' | 'root' = 'leaf', para_in_li: boolean = true, ret: "block" | "id" ="block") {
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
                //如果是 li 内的 p 节点, 则
                if (para_in_li && block.type === 'p') {
                    let parent = blocksMap.get(block.parent_id);
                    if (parent && parent.type === 'i') {
                        block = parent;
                    }
                }
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
        b2link: (b: Block) => `[${b.fcontent || b.content}](siyuan://blocks/${b.id})`,
        b2ref: (b: Block) => `((${b.id} '${b.fcontent || b.content}'))`
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
