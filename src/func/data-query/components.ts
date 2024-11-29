import { formatDateTime, sy2Date } from "@/utils/time";
import { BlockTypeShort } from "@/utils/const";
import { debounce, getNotebook } from "@/utils";
import { getLute } from "./lute";
import { request } from "@/api";

const renderAttr = (b: Block, attr: keyof Block, options?: {
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

    switch (attr) {
        case 'type':
            const type = BlockTypeShort[b.type].slice(0, -1);
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
            v = parseTime(b[attr]);
            break;

        default:
            v = b[attr];
            break;
    }
    return v;
}


/**************************************** 重构几个默认显示组件 ****************************************/


class List {
    element: HTMLElement;
    //嵌套列表
    dataList: any[];
    type: 'u' | 'o' = 'u';

    constructor(options: { target: HTMLElement, dataList: any[], type?: 'u' | 'o' }) {
        this.element = options.target;
        this.dataList = options.dataList;
        this.type = options.type ?? 'u';
        this.render();
    }

    render() {
        const lute = getLute();
        const dataList = this.dataList;
        let trimList: string[];
        if (this.type === 'u') {
            trimList = dataList.map(x => "* " + x.toString());
        } else {
            trimList = dataList.map((x, idx) => `${idx + 1}. ${x.toString()}`);
        }
        const mdStr = trimList.join("\n");
        const html = lute.Md2BlockDOM(mdStr);

        this.element.innerHTML = `<div>${html}</div>`;
    }
}

class Table {
    element: HTMLElement;
    tableData: any[][];
    private center: boolean;
    private indices: boolean;
    constructor(options: {
        target: HTMLElement, tableData: any[][], center?: boolean,
        indices?: boolean
    }) {
        this.element = options.target;

        this.center = options?.center ?? false;
        this.indices = options?.indices ?? false;
        if (this.indices) {
            this.tableData = options.tableData.map((row, idx) => [idx, ...row]);
            if (this.tableData[0]?.length > 1) {
                this.tableData[0][0] = '#';
            }
        } else {
            this.tableData = options.tableData;
        }
        this.render();
    }

    render() {
        const lute = getLute();
        const tableData = this.tableData;
        const headerRow = tableData[0].map(header => `<th>${lute.InlineMd2BlockDOM(`${header}`)}</th>`).join('');
        const bodyRows = tableData.slice(1).map(row => {
            const rowItems = row.map(rowItem => `<td>${lute.InlineMd2BlockDOM(`${rowItem}`)}</td>`).join('');
            return `<tr>${rowItems}</tr>`;
        }).join('');

        // max-width: 100%;

        const tableHtml = `
            <table class="query-table" style="${this.center ? 'margin: 0 auto;' : ''}">
                <thead>
                    <tr>${headerRow}</tr>
                </thead>
                <tbody>${bodyRows}</tbody>
            </table>
        `;

        this.element.innerHTML = tableHtml;
    }
}


class BlockTable extends Table {
    constructor(options: {
        target: HTMLElement, blocks: Block[], center?: boolean,
        col?: (keyof Block)[], indices?: boolean,
        renderer?: (b: Block, attr: keyof Block) => string | number | undefined | null,
    }) {
        let cols: any[] = options?.col ?? ['type', 'content', 'root_id', 'box', 'created'];
        let tables: ((string | number)[])[] = [cols];
        const render = (b: Block, c: keyof Block) => {
            if (options?.renderer) {
                return options.renderer(b, c) ?? renderAttr(b, c);
            } else {
                return renderAttr(b, c);
            }
        }
        options.blocks.forEach((b: Block) => {
            let rows = cols.map(c => render(b, c) ?? '');
            tables.push(rows);
        });
        super({ ...options, tableData: tables })
    }
}


class Mermaid {
    element: HTMLElement;
    type: 'flowchart' | 'mindmap';
    code: string;
    map: Record<BlockId, BlockId | BlockId[]>;
    blocks?: Record<BlockId, Block>;

    private blockSet: Set<BlockId>; //在 mermaid 中定义的节点
    private renderer: (b: Block) => string | null;
    private direction: 'TD' | 'LR';
    constructor(options: {
        target: HTMLElement,
        type: 'flowchart' | 'mindmap',
        map: Record<BlockId, BlockId | BlockId[]>,
        blocks?: Block[],
        renderer?: (b: Block) => string | null,
        flowchart?: 'TD' | 'LR',
    }) {
        this.element = options.target;
        this.type = options.type;
        this.code = '';
        this.map = options.map;  // 关联图关联关系
        const blocks = options.blocks ?? [];
        this.blocks = blocks.reduce((acc, b) => {
            acc[b.id] = b;
            return acc;
        }, {} as Record<BlockId, Block>);

        this.renderer = options.renderer;
        this.direction = options.flowchart ?? 'LR';
        this.checkRelationMap().then(() => {
            this.render();
        });
    }

    private async render() {
        if (this.type === 'flowchart') {
            this.buildFlowchartCode();
        } else if (this.type === 'mindmap') {
            this.buildMindmapCode();
        }
        console.log(this.code);
        const id = "mermaid" + window.Lute.NewNodeID();
        const mermaidData = await window.mermaid.render(id, this.code);
        this.element.innerHTML = mermaidData.svg;
        //add 悬浮 Event, 悬浮超过 3s 则触发回调
        const handler = (event: MouseEvent) => {
            const element = event.target as HTMLElement;
            if (!element.dataset.id) return;
            console.log(element.dataset.id);
        }
        const debouncedHandler = debounce(handler, 1000);
        this.element.addEventListener('mouseenter', debouncedHandler);
    }


    private async checkRelationMap() {
        // 1. 遍历 this.map，检查所有出现的 blockId
        const set = new Set<BlockId>();
        Object.entries(this.map).forEach(([k, v]) => {
            set.add(k);
            if (Array.isArray(v)) {
                v.forEach(id => set.add(id));
            } else {
                set.add(v);
            }
        });

        //2. 检查 self.blocks 是否包含所有 set 中的 blockId
        const notfound = new Set<BlockId>();
        set.forEach(id => {
            if (!this.blocks?.[id]) {
                notfound.add(id);
            }
        });
        const notfoundList = Array.from(notfound);
        const blocks = await globalThis.Query.getBlocksByIds(...notfoundList);

        //3. 更新 self.blocks
        if (blocks.length > 0) {
            blocks.forEach(b => this.blocks[b.id] = b);
        }
        this.blockSet = set;
    }

    /**
     * 根据 this.map 和 this.blocks 构建 mermaid 代码
     */
    private buildFlowchartCode() {
        this.code = `flowchart ${this.direction}\n`;
        const lines = [];
        //1. 定义各个节点
        this.blockSet.forEach(id => {
            const b = this.blocks[id];
            let content = this.renderer?.(b) ?? (b.fcontent || b.content);
            lines.push(`${id}["${content ?? id}"]`);
            // 定义 click 事件
            lines.push(`click ${id} "siyuan://blocks/${b.id}"`);
        });
        //2. 定义各个边
        Object.entries(this.map).forEach(([k, v]) => {
            // lines.push(`${k} --> ${v}`);
            if (Array.isArray(v)) {
                v.forEach(id => lines.push(`${k} --> ${id}`));
            } else {
                lines.push(`${k} --> ${v}`);
            }
        });
        this.code += lines.map(l => `    ${l}`).join('\n');
    }

    private buildMindmapCode() {
        this.code = 'mindmap\n';
        const lines: string[] = [];

        // Find root nodes (nodes that are not targets in the map)
        const targetIds = new Set(
            Object.values(this.map)
                .flatMap(v => Array.isArray(v) ? v : [v])
        );
        const rootIds = Array.from(this.blockSet)
            .filter(id => !targetIds.has(id));

        // Recursive function to build mindmap branches
        const buildBranch = (id: BlockId, depth: number = 1) => {
            const b = this.blocks[id];
            const content = this.renderer?.(b) ?? (b.fcontent || b.content || id);
            // Add current node
            lines.push(`${'    '.repeat(depth)}${content}`);

            // Process children
            const children = this.map[id];
            if (children) {
                const childIds = Array.isArray(children) ? children : [children];
                childIds.forEach(childId => buildBranch(childId, depth + 1));
            }
        };

        // Build from each root node
        rootIds.forEach(rootId => buildBranch(rootId));

        this.code += lines.join('\n');
    }
}

class EmbedNodes {
    element: HTMLElement;
    blockIds: BlockId[];

    constructor(options: { target: HTMLElement, blockIds: BlockId[] }) {
        this.element = options.target;
        this.blockIds = options.blockIds;
        this.render();
    }

    private async render() {
        const frag = document.createDocumentFragment();

        // Create array of promises for all block content requests
        const promises = this.blockIds.map(id =>
            request('/api/block/getBlockDOM', { id })
        );

        const results = await Promise.all(promises);

        results.forEach((content, index) => {
            const div = document.createElement('div');
            div.className = 'block-content';
            Object.assign(div.style, {
                'padding': '0.5em',
                'border': results.length > 1 ? '1px solid var(--b3-border-color)' : 'initial',
                'border-radius': '0',
            });
            div.dataset.nodeId = this.blockIds[index];
            div.innerHTML = content.dom;
            frag.appendChild(div);
        });
        frag.querySelectorAll('[contenteditable]').forEach(el => {
            el.setAttribute('contenteditable', 'false');
        });

        const div = document.createElement('div');
        div.className = 'render-node';
        div.dataset.type = 'NodeBlockQueryEmbed';
        div.dataset.nodeId = "";
        // Object.assign(div.style, {
        //     'margin': '0.25em 0.5em'
        // });
        div.appendChild(frag);

        this.element.appendChild(div);
    }
}

export {
    List,
    Table,
    BlockTable,
    Mermaid,
    EmbedNodes as BlockNodes,
    renderAttr
}
