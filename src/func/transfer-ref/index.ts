/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-07 18:05:50
 * @FilePath     : /src/func/transfer-ref/index.ts
 * @LastEditTime : 2025-02-10 22:34:47
 * @Description  : 
 */
import { Menu } from "siyuan";

import type FMiscPlugin from "@/index";
import TransferRefs from "./transfer-refs";
import { solidDialog } from "@/libs/dialog";

const showTransferDialog = (srcBlock: BlockId) => {
    solidDialog({
        title: '转移引用',
        loader: () => (
            TransferRefs({
                plugin, srcBlockID: srcBlock
            })
        ),
        width: '1450px',
        maxWidth: '90%',
        height: '600px'
    })
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

export const declareToggleEnabled = {
    title: '💭 转移引用',
    description: '启用转移引用功能',
    defaultEnabled: false
};

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
