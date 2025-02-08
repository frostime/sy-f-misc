/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-08 16:39:25
 * @FilePath     : /src/func/super-ref-db/index.ts
 * @LastEditTime : 2025-02-08 16:43:30
 * @Description  : siyuan://blocks/20250208162727-qgmztam
 */
import type FMiscPlugin from "@/index";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { createBlankSuperRefDatabase } from "./top-down";

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

let removeMenus = () => {};

export const load = () => {
    if (enabled) return;
    enabled = true;
    const plugin = thisPlugin();
    removeMenus = plugin.registerOnClickDocIcon((detail) => {
        detail.menu.addItem({
            label: '插入 SuperRef 数据库',
            click: () => {
                createBlankSuperRefDatabase(detail.root_id);
            }
        })
    });
};

export const unload = () => {
    if (!enabled) return;
    enabled = false;
    removeMenus();
    removeMenus = () => {};
};
