import { Dialog, Menu } from "siyuan";

import type FMiscPlugin from "@/index";
import { TransferRefsComponent } from "./pannel";


const showTransferDialog = (srcBlock: BlockId) => {
    let components = new TransferRefsComponent(plugin, srcBlock);
    let dialog = new Dialog({
        title: '转移引用',
        content: `<div id="transfer-ref" class="fn__flex fn__flex-1"></div>`,
        width: "60%",
        height: "50%"
    });
    let div: HTMLElement = dialog.element.querySelector("#transfer-ref");
    components.render(div);
}

function onBlockGutterClicked({ detail }: any) {
    if (detail.blockElements.length > 1) {
        return;
    }
    let menu: Menu = detail.menu;
    let protype: HTMLElement = detail.blockElements[0];
    let blockId = protype.getAttribute('data-node-id');
    menu.addItem({
        label: '转移引用',
        icon: "iconTransfer",
        click: () => {
            showTransferDialog(blockId);
        }
    });
}

function onDocGutterClicked({ detail }: any) {
    let blockId = detail.data.id;
    let menu: Menu = detail.menu;
    menu.addItem({
        label: '转移引用',
        icon: "iconTransfer",
        click: () => {
            showTransferDialog(blockId);
        }
    });
}

let plugin: FMiscPlugin = null;

export let name = "TransferRef";
export let enabled = false;
export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    plugin_.eventBus.on("click-blockicon", onBlockGutterClicked);
    plugin_.eventBus.on("click-editortitleicon", onDocGutterClicked);
    plugin = plugin_;
    enabled = true;
}

export const unload = (plugin_: FMiscPlugin) => {
    if (!enabled) return;
    plugin_.eventBus.off("click-blockicon", onBlockGutterClicked);
    plugin_.eventBus.off("click-editortitleicon", onDocGutterClicked);
    plugin = null;
    enabled = false;
}
