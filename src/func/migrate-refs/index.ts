/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-14 22:13:04
 * @FilePath     : /src/func/migrate-refs/index.ts
 * @LastEditTime : 2024-10-20 17:54:29
 * @Description  : 
 */
import { type EventMenu, type IGetDocInfo, type IProtyle } from "siyuan";
import type FMiscPlugin from "@/index";
import { getBlockByID, sql } from "@/api";
import { solidDialog } from "@/libs/dialog";
import RefsTable from "./refs-tables";

const searchRefs = async (id: BlockId) => {
    const fmt = `
    select * from blocks where id in (
        select block_id from refs where def_block_id = '${id}'
    ) order by updated desc limit 999;
    `;
    let blocks = await sql(fmt);
    return blocks;
}

const clickDocIcon = async (event: CustomEvent<{
    menu: EventMenu,
    protyle: IProtyle,
    data: IGetDocInfo,
}>) => {
    let detail = event.detail;
    let { name, rootID } = detail.data;

    detail.menu.addItem({
        icon: 'iconEmoji',
        label: '迁移反链',
        click: async () => {
            let defBlock = await getBlockByID(rootID);
            const queryRefBlocks = async (fb2p?: boolean) => {
                let blocks = await searchRefs(rootID);
                if (fb2p) {
                    blocks = await globalThis.Query.fb2p(blocks); //依赖于 data-query 中的功能
                }
                return blocks;
            }
            solidDialog({
                title: `Refs ${name}`,
                loader: () => RefsTable({ defBlock: defBlock, queryRefBlocks }),
                width: '1250px',
                maxHeight: '80%'
            })
        }
    });
}

export let name = "MigrateRefs";
export let enabled = false;

export const declareToggleEnabled = {
    title: '💭 迁移引用',
    description: '将引用迁移到同一个笔记本中',
    defaultEnabled: false
};

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.eventBus.on('click-editortitleicon', clickDocIcon);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.eventBus.off('click-editortitleicon', clickDocIcon);
}