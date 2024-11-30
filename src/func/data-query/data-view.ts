import {
    IProtyle,
    fetchSyncPost,
    Lute
} from "siyuan";
import { getLute } from "./lute";
import { List, Table, BlockTable, Mermaid, BlockNodes } from './components';
import { getBlockByID } from "@/api";

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

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export class DataView {
    private protyle: IProtyle;
    private item: HTMLElement;
    private top: number | null;
    private lute: Lute;
    _element: HTMLElement;
    _ele: WeakRef<HTMLElement>;  //alias for element

    private PROHIBIT_METHOD_NAMES = ['register', 'element', 'ele', 'render'];


    /**
     * 注册组件 View
     * @param method: `(...args: any[]) => HTMLElement`, 一个返回 HTMLElement 的方法
     * @param options: 其他配置
     *  - aliases: 组件的别名
     *  - addViewFn: 一个返回 HTMLElement 的方法，用于添加组件
     *  - outsideMethod: 是否为外部方法，默认为 false，将会自动执行 `method.bind(this)`
     */
    register(method: (...args: any[]) => HTMLElement, options: {
        aliases?: string[], addViewFn?: (...args: any[]) => HTMLElement,
        outsideMethod?: boolean
    } = {}) {

        const methodName = method.name;
        const aliasSet = new Set(options.aliases ?? []);
        const newAliases = [];

        if (this.PROHIBIT_METHOD_NAMES.includes(methodName)) {
            console.warn(`Method name ${methodName} is prohibited, please use another name.`);
            return;
        }

        // 先收集所有需要添加的新别名
        aliasSet.add(methodName);
        for (const alias of aliasSet) {
            newAliases.push(capitalize(alias));
            newAliases.push(alias.toLowerCase());
        }

        // 然后一次性添加到 Set 中
        newAliases.forEach(alias => aliasSet.add(alias));

        const aliases = Array.from(aliasSet);

        // console.debug(`Alias for ${methodName}:`, aliases);

        // Register base method and its aliases
        aliases.forEach(alias => {
            this[alias] = options.outsideMethod ? method : method.bind(this);
            this[alias.toLowerCase()] = options.outsideMethod ? method : method.bind(this);
        });

        const addViewFn = options.addViewFn?.bind(this) ?? ((...args: any[]) => {
            const result = options.outsideMethod ? method(args) : method.apply(this, args);
            this._element.append(result);
            return result.firstElementChild || result;
        });

        // Register add method
        this['add' + methodName] = addViewFn;
        aliases.forEach(alias => {
            const fnName = 'add' + alias;
            this[fnName] = addViewFn;
            this[fnName.toLowerCase()] = addViewFn;
        });
    }

    constructor(protyle: IProtyle, item: HTMLElement, top: number | null) {
        this.protyle = protyle;
        this.item = item;
        this.top = top;
        this._element = document.createElement("div");
        this._ele = new WeakRef(this._element);
        this._element.classList.add('data-query-embed');
        Object.assign(this._element.style, {
            'cursor': 'default',
        });
        this.item.lastElementChild.insertAdjacentElement("beforebegin", this._element);
        this.lute = getLute();

        this.register(this.markdown, { aliases: ['md'] });
        this.register(this.list, { aliases: ['BlockList'] });
        this.register(this.table);
        this.register(this.blockTable);
        this.register(this.columns, { aliases: ['Cols'] });
        this.register(this.rows);
        this.register(this.mermaid);
        this.register(this.embed);
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

        this._element.append(customElem);
        return customElem;
    }

    addelement = this.addElement;
    addele = this.addElement;

    markdown(md: string) {
        let elem = newDivWrapper();
        elem.innerHTML = this.lute.Md2BlockDOM(md);
        return elem;
    }

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
        const result = listContainer;
        return result;
    }

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
            table.element.querySelector('table').style.width = '100%';
        }

        return tableContainer;
    }

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
            table.element.querySelector('table').style.width = '100%';
        }
        return tableContainer;
    }

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

    mermaid(map: Record<BlockId, BlockId | BlockId[]>, options: {
        blocks?: Block[],
        type?: "flowchart" | "mindmap",
        flowchart?: 'TD' | 'LR',
        renderer?: (b: Block) => string;
    } = {}) {
        let mermaidContainer = newDivWrapper();
        // 检查 map，防止出现 null 或者 undefined
        map = Object.fromEntries(Object.entries(map).filter(([k, v]) => k && v));
        new Mermaid({
            target: mermaidContainer,
            type: options.type ?? "flowchart",
            map,
            blocks: options.blocks,
            renderer: options.renderer,  // undefined 也不要紧, 组件里有默认渲染方式
            flowchart: options.flowchart ?? 'LR'
        });
        return mermaidContainer;
    }

    embed(blocks: Block[] | Block, options: {
        breadcrumb?: boolean;
    }) {
        const container = newDivWrapper();

        if (!Array.isArray(blocks)) {
            blocks = [blocks];
        }

        new BlockNodes({ target: container, blocks, breadcrumb: options?.breadcrumb });
        return container;
    }

    render() {
        this.protyle.element.addEventListener("keydown", cancelKeyEvent, true);
        const rotateElement = this.item.querySelector(".fn__rotate");

        if (rotateElement) {
            rotateElement.classList.remove("fn__rotate");
        }

        this._element.setAttribute("contenteditable", "false");
        this._element.onmousedown = (el) => { el.stopImmediatePropagation(); };
        this._element.onmouseup = (el) => { el.stopImmediatePropagation(); };
        this._element.onkeydown = (el) => { el.stopImmediatePropagation(); };
        this._element.onkeyup = (el) => { el.stopImmediatePropagation(); };
        this._element.oninput = (el) => { el.stopImmediatePropagation(); };
        this._element.onclick = (el) => {
            el.stopImmediatePropagation();
            const selection = window.getSelection();
            const length = selection.toString().length;
            if (length === 0 && (el.target as HTMLElement).tagName === "SPAN") {
                return;
            }
            // el.stopPropagation();
        };

        if (this.top) {
            // 前进后退定位 https://ld246.com/article/1667652729995
            this.protyle.contentElement.scrollTop = this.top;
        }

        // 确保内部节点不可编辑
        let editableNodeList = this._element.querySelectorAll('[contenteditable="true"]');
        editableNodeList.forEach(node => {
            node.setAttribute('contenteditable', 'false');
        });

        this.item.style.height = "";
        let content = this.lute.BlockDOM2Content(this._element.innerText).replaceAll('\n', ' ');
        fetchSyncPost('/api/search/updateEmbedBlock', {
            id: this.item.getAttribute("data-node-id"),
            content: content
        });
    }
}
