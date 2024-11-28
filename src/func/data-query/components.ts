import { formatDateTime, sy2Date } from "@/utils/time";
import { BlockTypeShort } from "@/utils/const";
import { getNotebook } from "@/utils";
import { getLute } from "./lute";


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

export {
    List,
    Table,
    BlockTable,
    renderAttr
}
