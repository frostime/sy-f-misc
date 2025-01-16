/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:29:32
 * @FilePath     : /src/func/gpt/persistence/index.ts
 * @LastEditTime : 2025-01-16 20:39:21
 * @Description  : 
 */
import { saveToSiYuan } from "./sy-doc";
import { saveToJson } from "./json-files";
import { confirmDialog } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";

export const persistHistory = async (history: IChatSessionHistory, options?: {
    onlyJson?: boolean;
    verbose?: boolean;
}) => {
    await saveToJson(history)
    if (options?.verbose !== false) showMessage('保存成功')
    if (options?.onlyJson) return;
    confirmDialog({
        title: '保存成功',
        content: `是否还需要将对话导出到思源笔记文档中?`,
        confirm: async () => {
            await saveToSiYuan(history)
        }
    });
}

export * from "./sy-doc";
export * from "./json-files";
export * from "./local-storage";
export * from "./import-platform";