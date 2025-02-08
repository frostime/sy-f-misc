/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-08 16:39:25
 * @FilePath     : /src/func/super-ref-db/index.ts
 * @LastEditTime : 2025-02-08 20:10:55
 * @Description  : siyuan://blocks/20250208162727-qgmztam
 */

import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { createBlankSuperRefDatabase, getSuperRefDb, syncDatabaseFromBacklinks } from "./top-down";
import { getBlockByID } from "@frostime/siyuan-plugin-kits/api";

export let name = "SuperRefDB";
export let enabled = false;

// Optional: Configure module settings
export const declareToggleEnabled = {
    title: "超级引用",
    description: "将双链引用和数据库功能相结合，实现类似 Super Tag 的功能",
    defaultEnabled: false
};

/*
// Optional: Declare settings panel
export const declareSettingPanel = [
    {
        key: "",
        title: "",
        element: () => null
    }
];

// Optional: Declare simple module config
export const declareModuleConfig = {
    key: "",
    items: [],
    init: (itemValues?: Record<string, any>) => {
        // Initialize config here
    }
};
*/

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
            label: '更新SuperRef数据库',
            click: () => {
                syncDatabaseFromBacklinks({ doc: detail.root_id });
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
                syncDatabaseFromBacklinks({ doc: docId });
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
                    await syncDatabaseFromBacklinks({ doc: block.id, database: db });
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
