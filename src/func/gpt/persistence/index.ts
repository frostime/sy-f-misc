/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:29:32
 * @FilePath     : /src/func/gpt/persistence/index.ts
 * @LastEditTime : 2026-01-02 13:34:19
 * @Description  :
 * @SpecDoc      : .dev/docs/gpt-chat-history-persistence.md
 */
import { saveToSiYuan, saveToSiYuanAssetFile } from "./sy-doc";
export { archiveWorkingHistory, copyArchiveLink } from './archive-actions';
// import { confirmDialog } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";

/** Exports have no permanent-archive side effect. Document/asset exporters retain
 * their existing target-update behavior, independent from chat-history JSON. */
export const exportWorkingHistory = async (history: IChatSessionHistoryV2, target: 'document' | 'asset') => {
    if (!history || history.schema !== 2) {
        showMessage('历史记录格式错误，无法导出');
        return;
    }
    try {
        if (target === 'document') await saveToSiYuan(history);
        else {
            await saveToSiYuanAssetFile(history);
            showMessage('附件已导出；永久对话存档未更新');
        }
    } catch (error) {
        showMessage(`导出失败：${(error as Error).message || error}`, 7000, 'error');
    }
};

export * from "./sy-doc";
export * from "./json-files";
export * from "./local-storage";
export * from "./import-platform";
export * from "./xml";

// 导出 snapshot 相关功能
export { rebuildHistorySnapshot, listFromJsonSnapshot, listFromJsonFull, updateSessionInSnapshot, updateSnapshotSession } from "./json-files";