/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-08 16:39:25
 * @FilePath     : /src/func/super-ref-db/index.ts
 * @LastEditTime : 2025-02-12 00:36:32
 * @Description  : siyuan://blocks/20250208162727-qgmztam
 */

import { matchIDFormat, openBlock, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { createBlankSuperRefDatabase, getSuperRefDb, syncDatabaseFromBacklinks, configs } from "./core";
import { getBlockByID } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";

export let name = "SuperRefDB";
export let enabled = false;

// Optional: Configure module settings
export const declareToggleEnabled = {
    title: "🔗 Super Ref",
    description: "将双链引用和数据库功能相结合",
    defaultEnabled: false
};


const redirectStrategy = () => configs.doRedirect ? 'fb2p' : 'none';

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: name,
    title: declareToggleEnabled.title,
    load: (values: Record<string, any>) => {
        if (values.doRedirect !== undefined && values.doRedirect !== null) {
            configs.doRedirect = Boolean(values.doRedirect);
        }
    },
    dump: () => {
        return configs;
    },
    items: [
        {
            key: 'doRedirect',
            type: 'checkbox',
            title: '重定向双链引用',
            description: `
                开启后，会对双链引用进行重定向: 容器块的首个段落子块会被重定向到容器块本身，标题块和文档块下方的第一个段落子块会被重定向到标题块和文档块本身。<br/>
                <b>注意! 这个选项影响很大， 请不要频繁变动！</b>
            `,
            get: () => configs.doRedirect,
            set: (value: boolean) => {
                configs.doRedirect = value;
            }
        }
    ],
};



let unRegister = () => { };

export const load = () => {
    if (enabled) return;
    enabled = true;
    const plugin = thisPlugin();
    let d1 = plugin.registerOnClickDocIcon((detail) => {
        detail.menu.addItem({
            icon: 'iconDatabase',
            label: '插入SuperRef数据库',
            click: () => {
                createBlankSuperRefDatabase(detail.root_id);
            }
        });
        detail.menu.addItem({
            icon: 'iconDatabase',
            label: '打开SuperRef数据库',
            click: async () => {
                const db = await getSuperRefDb(detail.root_id);
                if (!db || !matchIDFormat(db.block)) {
                    showMessage('无法找到SuperRef数据库');
                    return;
                }
                openBlock(db.block, { zoomIn: true });
            }
        });
    });
    let d2 = plugin.registerOnClickBlockicon((detail) => {
        if (detail.blocks.length !== 1) return;
        let block = detail.blocks[0];
        if (block.type !== 'NodeAttributeView') return;

        let ele = detail.blockElements[0];
        let docId = ele.getAttribute('custom-super-ref-db');
        if (!docId) return;

        detail.menu.addItem({
            icon: 'iconDatabase',
            label: '更新SuperRef数据库',
            click: () => {
                syncDatabaseFromBacklinks({
                    doc: docId, removeOrphanRows: 'ask', redirectStrategy: redirectStrategy()
                });
            }
        });
    });
    let d3 = plugin.registerEventbusHandler('open-menu-blockref', (detail) => {
        const span = detail.element;
        const dataId = span.getAttribute('data-id');
        detail.menu.addItem({
            icon: 'iconDatabase',
            label: '绑定为SuperRef',
            click: async () => {
                let block = await getBlockByID(dataId);
                if (!block) return;
                if (block.type !== 'd') return;
                let db = await getSuperRefDb(block.id);
                if (!db) {
                    await createBlankSuperRefDatabase(block.id);
                } else {
                    await syncDatabaseFromBacklinks({
                        doc: block.id, database: db, removeOrphanRows: 'no', redirectStrategy: redirectStrategy()
                    });
                }
            }
        });
    });
    unRegister = () => {
        d1();
        d2();
        d3();
    };
};

export const unload = () => {
    if (!enabled) return;
    enabled = false;
    unRegister();
    unRegister = () => { };
};
