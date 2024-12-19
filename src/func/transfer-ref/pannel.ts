import { showMessage } from "siyuan";

import type FMiscPlugin from "@/index";
import * as api from '@/api';
import { getNotebook } from "@frostime/siyuan-plugin-kits";
import { BlockTypeShort } from "@frostime/siyuan-plugin-kits";

export class TransferRefsComponent {
    private plugin: FMiscPlugin;
    private srcBlockID: BlockId; // 被引用的块
    private refBlockInfo: any[] = [];  //引用 src 块的块

    private element: HTMLElement;
    private checkboxTitle: HTMLInputElement;  //顶部的全选框

    private dstChoose: string = "";  //右侧选中的转移目标块
    private refChoose: BlockId[] = []; //左侧选中的需要被引用的块
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
                notebook: getNotebook(block.box)?.name ?? block.box,
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
            return a.hpath.localeCompare(b.hpath) ?? 0;
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

    //input checkbox change
    private clickCheckboxBlock(event: InputEvent) {
        let checkbox = event.target as HTMLInputElement;
        let blockId = checkbox.value;
        let checked = checkbox.checked;
        if (checked) {
            this.refChoose.push(blockId);
        } else {
            this.refChoose = this.refChoose.filter((id) => id !== blockId);
        }

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

    private clickCheckboxTitle() {
        let checked = this.checkboxTitle.checked;
        if (checked) {
            this.refChoose = this.refBlockInfo.map((block) => block.id);
        } else {
            this.refChoose = [];
        }
        this.element.querySelectorAll(".refChoose").forEach((checkbox: HTMLInputElement) => {
            checkbox.checked = checked;
        });
    }

    private clipStr(str: string, len: number): string {
        if (str.length > len) {
            return str.slice(0, len) + "...";
        } else {
            return str;
        }
    }
    public async render(container: HTMLElement) {
        let refBlockInfo = await this.queryRefs();
        let candidates = await this.queryFamily();

        const rows = refBlockInfo.map(
            (block) => `
            <div class="row">
                <div class="cell-0">
                <input type="checkbox" value="${block.id}" class="refChoose" />
                </div>
                <div class="cell b3-tooltips b3-tooltips__n blockType" aria-label="${block.id}">
                <span class="blockType" data-id="${block.id}">${this.type2text(block.type)}</span>
                </div>
                <div class="cell">${block.notebook}</div>
                <div class="cell">${block.doc}</div>
                <div class="cell">${this.clipStr(block.content, 50)}</div>
            </div>`
        );
        const options = candidates.map(
            (block) => `
            <label>
                <input type="radio" name="dstChoose" value="${block.id}" />
                ${block.hpath.split("/").pop()}
            </label>`
        );

        container.innerHTML = `
          <main id="main" class="fn__flex fn__flex-1 transfer-ref">
            <section id="refs" class="fn__flex-1">
              <div class="refs-table">
                <div class="row header">
                  <div class="cell-0">
                    <input type="checkbox" id="checkboxTitle" />
                  </div>
                  <div class="cell">块类型</div>
                  <div class="cell">笔记本</div>
                  <div class="cell">文档</div>
                  <div class="cell">内容</div>
                </div>
                ${rows.join("\n")}
              </div>
            </section>
      
            <div class="layout__resize--lr layout__resize"></div>
      
            <section id="dsts">
              <div id="transBtn">
                <div>
                  <input class="b3-text-field fn__flex-center" id="dstBlockID" placeholder="目标块ID" />
                </div>
                <div>
                  <button class="b3-button b3-button--outline fn__flex-center" id="transferBtn">
                    转移到
                  </button>
                </div>
              </div>
      
              <div id="dstOptions">
                <h4>候选</h4>
                ${options.join("\n")}
              </div>
            </section>
          </main>
        `;

        //点击顶端的 checkbox, 全选、全不选
        this.checkboxTitle = container.querySelector("#checkboxTitle") as HTMLInputElement;
        this.checkboxTitle.addEventListener("change", this.clickCheckboxTitle.bind(this));

        //点击下方每个 row 的 checkbox
        container.querySelectorAll(".refChoose").forEach((checkbox) => {
            checkbox.addEventListener("change", this.clickCheckboxBlock.bind(this));
        });

        //点击按钮，弹出 Protyle 预览
        container.querySelectorAll(".blockType").forEach((span) => {
            span.addEventListener("click", (event: MouseEvent) => {
                this.showSrcBlock(span.getAttribute("data-id") as BlockId, event);
            });
        });

        //在输入框中输入目标块 ID
        const dstBlockIDInput = container.querySelector("#dstBlockID") as HTMLInputElement;
        dstBlockIDInput.addEventListener("input", (event) => {
            this.dstBlockID = (event.target as HTMLInputElement).value as BlockId;
        });

        //点击右侧的 radio，选择目标块
        container.querySelectorAll('input[name="dstChoose"]').forEach((radio) => {
            radio.addEventListener("change", (event) => {
                this.dstChoose = (event.target as HTMLInputElement).value;
                this.dstBlockID = this.dstChoose as BlockId;
                dstBlockIDInput.value = this.dstBlockID;
            });
        });

        //点击按钮，转移
        const transferBtn = container.querySelector("#transferBtn") as HTMLButtonElement;
        transferBtn.addEventListener("click", this.transferRefs.bind(this));

        this.element = container;
    }
}

function isnot(value: any) {
    if (value === undefined || value === null) {
        return true;
    } else if (value === false) {
        return true;
    } else if (typeof value === 'string' && value.trim() === '') {
        return true;
    } else if (value?.length === 0) {
        return true;
    }
    return false;
}

async function getChildDocs(block: BlockId, limit = 64) {
    let sqlCode = `select * from blocks where path regexp '.*/${block}/[0-9a-z\-]+\.sy' and type='d'
    order by hpath desc limit ${limit};`;
    let childDocs = await api.sql(sqlCode);
    return childDocs;
}
