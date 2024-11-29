import {
    IProtyle,
    fetchSyncPost,
    Lute
} from "siyuan";
import { getLute } from "./lute";
import { List, Table, BlockTable, Mermaid, BlockNodes } from './components';

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

const newDivWrapper = () => {
    let div = document.createElement("div");
    div.style.overflowX = "auto";
    div.className = "js-query-data-view";
    div.style.paddingLeft = "0.5em";
    div.style.paddingRight = "0.5em";
    return div;
}

interface ListOptions {
    type?: 'u' | 'o';
    columns?: number;
    renderer?: (b: Block) => string | number | undefined | null;
}

interface TableOptions {
    center?: boolean;
    fullwidth?: boolean;
    index?: boolean;
    renderer?: (b: Block, attr: keyof Block) => string | number | undefined | null; //仅对BlockTable有效
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
        this.lute = getLute();
    }

    addElement(CustomEmbed: HTMLElement | string) {
        const customElem = newDivWrapper();

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

    markdown(md: string) {
        // let elem = document.createElement("div");
        // elem.style.display = 'contents';
        // elem.className = "item__readme b3-typography";
        let elem = newDivWrapper();
        elem.innerHTML = this.lute.Md2BlockDOM(md);
        return elem;
    }
    md = this.markdown;

    addMarkdown(md: string) {
        let elem = this.markdown(md);
        this.element.append(elem);
        return elem;
    }

    addmd = this.addMarkdown;
    addmarkdown = this.addMarkdown;

    list(data: any[], options: ListOptions = {}) {
        let defaultRenderer = (x: any) => {
            if (typeof x === 'object') {
                return JSON.stringify(x);
            }
            return x.toString();
        };
        if (data.length > 0 && data[0].id && data[0].content) {
            defaultRenderer = (b: Block) => `[${b.fcontent || b.content}](siyuan://blocks/${b.id})`;
        }

        defaultRenderer = options.renderer ?? defaultRenderer;

        data = data.map(defaultRenderer);


        let listContainer = newDivWrapper();
        const list = new List({
            target: listContainer,
            dataList: data,
            type: options.type ?? 'u'
        });
        if (options.columns) {
            list.element.style.columnCount = options.columns.toString();
        }
        return listContainer;
    }

    addList(data: any[], options: ListOptions = {}) {
        let listContainer = this.list(data, options);
        this.element.append(listContainer);
        return listContainer.firstElementChild as HTMLElement;
    }

    addlist = this.addList;

    //@deprecated 兼容之前的写法

    blocklist = this.list;

    addBlockList = this.addList;

    addblocklist = this.addBlockList;

    table(data: (Object | any[])[], options: TableOptions = {}) {
        let tableContainer = newDivWrapper();
        if (data.length == 0) return;

        let first = data[0];
        let table: Table;
        //如果是 Array
        if (Array.isArray(first)) {
            table = new Table({
                target: tableContainer,
                tableData: data as any[],
                center: options.center ?? false,
                indices: options.index ?? false
            });
        }
        //如果是 Object
        else if (typeof first === 'object') {
            let cols = Object.keys(first);
            let tableData = [cols];
            data.forEach(obj => {
                let row = cols.map(col => obj[col]);
                tableData.push(row);
            });
            table = new Table({
                target: tableContainer,
                tableData: tableData as any[],
                center: options.center ?? false,
                indices: options.index ?? false
            });
        }
        if (options.fullwidth) {
            table.element.style.width = '100%';
        }

        return tableContainer;
    }

    addTable(data: any[], options: TableOptions = {}) {
        let tableContainer = this.table(data, options);
        this.element.append(tableContainer);
        return tableContainer.firstElementChild as HTMLElement;
    }

    addtable = this.addTable;

    blockTable(blocks: Block[], cols?: (keyof Block)[], options: TableOptions = {}) {
        let tableContainer = newDivWrapper();
        const table = new BlockTable({
            target: tableContainer,
            blocks,
            col: cols,
            center: options.center ?? false,
            indices: options.index ?? false,
            renderer: options.renderer
        });
        if (options.fullwidth) {
            table.element.style.width = '100%';
        }
        return tableContainer;
    }

    addBlockTable(blocks: Block[], cols?: (keyof Block)[], options: TableOptions = {}) {
        let tableContainer = this.blockTable(blocks, cols, options);
        this.element.append(tableContainer);
        return tableContainer.firstElementChild as HTMLElement;
    }

    addblocktable = this.addBlockTable;

    columns(elements: HTMLElement[]) {
        let columns = document.createElement("div");
        Object.assign(columns.style, {
            display: "flex",
            flexDirection: "row",
            gap: "5px"
        });
        const column = (ele: HTMLElement) => {
            const div = document.createElement("div");
            Object.assign(div.style, {
                flex: "1",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "flex",
                flexDirection: "column"
            });
            div.append(ele);
            return div;
        }

        elements.forEach(e => columns.append(column(e)));
        return columns;
    }

    addColumns(elements: HTMLElement[]) {
        let columns = this.columns(elements);
        this.element.append(columns);
        return columns;
    }
    addcolumns = this.addColumns;

    rows(elements: HTMLElement[]) {
        let rows = document.createElement("div");
        Object.assign(rows.style, {
            display: "flex",
            flexDirection: "column",
            gap: "5px"
        });
        elements.forEach(e => rows.append(e));
        return rows;
    }

    addRows(elements: HTMLElement[]) {
        let rows = this.rows(elements);
        this.element.append(rows);
        return rows;
    }

    addrows = this.addRows;

    mermaid(map: Record<BlockId, BlockId | BlockId[]>, options: {
        blocks?: Block[],
        type?: "flowchart" | "mindmap",
        flowchart?: 'TD' | 'LR',
        renderer?: (b: Block) => string;
    } = {}) {
        let mermaidContainer = newDivWrapper();
        new Mermaid({
            target: mermaidContainer,
            type: options.type ?? "flowchart",
            map,
            blocks: options.blocks,
            renderer: options.renderer ?? (b => (b.fcontent || b.content) || b.id),
            flowchart: options.flowchart ?? 'LR'
        });
        return mermaidContainer;
    }

    addFlowchart(map: Record<BlockId, BlockId | BlockId[]>, options: {
        blocks?: Block[],
        renderer?: (b: Block) => string;
        flowchart?: 'TD' | 'LR';
    } = {}) {
        const flowchart = this.mermaid(map, { type: "flowchart", ...options });
        this.element.append(flowchart);
        return flowchart.firstElementChild as HTMLElement;
    }

    addflowchart = this.addFlowchart;

    addMindmap(map: Record<BlockId, BlockId | BlockId[]>, options: {
        blocks?: Block[],
        renderer?: (b: Block) => string;
    } = {}) {
        //@ts-ignore
        options.renderer = options.renderer ?? (b => `${b.id}["${b.fcontent || b.content}"]`);
        const mindmap = this.mermaid(map, { type: "mindmap", ...options });
        this.element.append(mindmap);
        return mindmap.firstElementChild as HTMLElement;
    }

    addmindmap = this.addMindmap;

    embed(...blocks: (Block | BlockId)[]) {
        const container = newDivWrapper();

        let blockIds: BlockId[] = blocks.map(b => {
            if (typeof b === 'object') {
                return b.id ?? null;
            }
            return b;
        });
        blockIds = blockIds.filter(b => b !== null);
        new BlockNodes({ target: container, blockIds });
        return container;
    }

    addEmbed(...blocks: (Block | BlockId)[]) {
        const container = this.embed(...blocks);
        this.element.append(container);
        return container.firstElementChild as HTMLElement;
    }

    addembed = this.addEmbed;

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
        let content = this.lute.BlockDOM2Content(this.element.innerText).replaceAll('\n', ' ');
        fetchSyncPost('/api/search/updateEmbedBlock', {
            id: this.item.getAttribute("data-node-id"),
            content: content
        });
    }
}
