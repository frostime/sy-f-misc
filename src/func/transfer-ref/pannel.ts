import { showMessage } from "siyuan";

import type FMiscPlugin from "@/index";
import * as api from '@/api';
import { getChildDocs, getNotebook, isnot } from "@/utils";
import { BlockTypeShort } from "@/utils/const";

export class TransferRefsComponent {
    private plugin: FMiscPlugin;
    private srcBlockID: BlockId;
    private refBlockInfo: any[] = [];
    private checkboxTitle: HTMLInputElement;
    private dstChoose: string = "";
    private refChoose: BlockId[] = [];
    private dstBlockID: BlockId = "";

    constructor(plugin: FMiscPlugin, srcBlockID: BlockId) {
        this.plugin = plugin;
        this.srcBlockID = srcBlockID;
    }

    private async queryRefs(): Promise<any[]> {
        let sqlQuery = `select * from blocks where id in (
          select block_id from refs where def_block_id = '${this.srcBlockID}') order by updated desc`;
        let refBlocks: Block[] = await api.sql(sqlQuery);
        this.refBlockInfo = [];
        for (let block of refBlocks) {
            this.refBlockInfo.push({
                id: block.id,
                type: block.type,
                notebook: getNotebook(block.box) ?? block.box,
                doc: block.hpath,
                content: block.content,
            });
        }
        return this.refBlockInfo;
    }

    private async queryFamily(): Promise<Block[]> {
        let srcBlock: Block = await api.getBlockByID(this.srcBlockID);
        let path = srcBlock.path.slice(1);
        let pathParts = path.split("/");
        let parentId: BlockId = null;
        console.log(pathParts);
        if (pathParts.length > 1) {
            parentId = pathParts[pathParts.length - 2];
            console.log(parentId);
        }

        let children: Block[] | undefined = await getChildDocs(srcBlock.root_id);
        children = children ?? [];
        let candidates = children.sort((a, b) => {
            return a.hpath.localeCompare(b.hpath);
        });
        if (parentId != null) {
            candidates.unshift(await api.getBlockByID(parentId));
        }
        return candidates;
    }

    private async transferRefs() {
        if (this.refChoose.length === 0) {
            showMessage('请选择需要转移的链接');
            return;
        }
        let sql = `select * from blocks where id = "${this.dstBlockID}" limit 1`;
        let result: Block[] = await api.sql(sql);
        if (isnot(result)) {
            showMessage(`目标块 ${this.dstBlockID} 不存在`);
            return;
        }
        api.transferBlockRef(this.srcBlockID, this.dstBlockID, this.refChoose);
    }

    private showSrcBlock(blockId: BlockId, event: MouseEvent) {
        event.stopPropagation();
        console.log(event);
        this.plugin.addFloatLayer({
            ids: [blockId],
            x: event.clientX,
            y: event.clientY,
        });
        //@ts-ignore
        let blockPanels = window.siyuan.blockPanels;
        let panel = blockPanels[blockPanels.length - 1];
        let ele = panel.element;
        ele.style.zIndex = "999";
    }

    private type2text(btype: string): string {
        let text = BlockTypeShort?.[btype];
        return text ?? btype;
    }

    private clickCheckboxBlock() {
        if (this.checkboxTitle) {
            if (this.refChoose.length === 0) {
                this.checkboxTitle.checked = false;
                this.checkboxTitle.indeterminate = false;
            } else if (this.refChoose.length === this.refBlockInfo.length) {
                this.checkboxTitle.checked = true;
                this.checkboxTitle.indeterminate = false;
            } else {
                this.checkboxTitle.checked = false;
                this.checkboxTitle.indeterminate = true;
            }
        }
    }

    private clickCheckboxTitle() {
        let checked = this.checkboxTitle.checked;
        if (checked) {
            this.refChoose = this.refBlockInfo.map((block) => block.id);
        } else {
            this.refChoose = [];
        }
    }

    private clipStr(str: string, len: number): string {
        if (str.length > len) {
            return str.slice(0, len) + "...";
        } else {
            return str;
        }
    }

    public async render() {
        let queryRefsPromise = this.queryRefs();
        let queryFamilyPromise = this.queryFamily();

        // Render the component HTML here using the query results
        // You can use template literals to generate the HTML string
        // and append it to the desired container element
        // Example:
        // const container = document.getElementById('container');
        // container.innerHTML = `
        //   <main id="main" class="fn__flex fn__flex-1">
        //     <!-- Rest of the HTML -->
        //   </main>
        // `;

        // Attach event listeners and perform any necessary DOM manipulations
    }
}
