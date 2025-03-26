/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:29:32
 * @FilePath     : /src/func/gpt/persistence/index.ts
 * @LastEditTime : 2025-03-16 18:27:56
 * @Description  : 
 */
import { saveToSiYuan, saveToSiYuanAssetFile } from "./sy-doc";
import { saveToJson } from "./json-files";
// import { confirmDialog } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";

export const persistHistory = async (history: IChatSessionHistory, options?: {
    // saveToSiYuan?: boolean;
    saveTo?: 'document' | 'asset'
    verbose?: string;
}) => {
    await saveToJson(history)
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