/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:29:32
 * @FilePath     : /src/func/gpt/persistence/index.ts
 * @LastEditTime : 2026-01-02 13:34:19
 * @Description  :
 */
import { saveToSiYuan, saveToSiYuanAssetFile } from "./sy-doc";
import { saveToJson } from "./json-files";
// import { confirmDialog } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";

export const persistHistory = async (history: IChatSessionHistoryV2, options?: {
    // saveToSiYuan?: boolean;
    saveJson?: boolean; //default true
    saveTo?: 'document' | 'asset'
    verbose?: string;
}) => {
    if (!history || history.schema !== 2) {
        showMessage('历史记录格式错误，无法归档保存');
        return;
    }

    if (options?.saveJson !== false) {
        await saveToJson(history);
    }
    if (options?.saveTo === 'document') {
        await saveToSiYuan(history)
    } else if (options?.saveTo === 'asset') {
        await saveToSiYuanAssetFile(history)
    }
    // if (options?.verbose !== false) showMessage('保存成功')
    if (options?.verbose) showMessage(options.verbose)
}

export * from "./sy-doc";
export * from "./json-files";
export * from "./local-storage";
export * from "./import-platform";

// 导出 snapshot 相关功能
export { rebuildHistorySnapshot, listFromJsonSnapshot, listFromJsonFull, updateSessionInSnapshot, updateSnapshotSession } from "./json-files";