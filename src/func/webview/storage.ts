/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-27 15:21:16
 * @FilePath     : /src/func/webview/storage.ts
 * @Description  : WebView storage configuration
 */

import { IWebApp } from "./utils/types";
import { CustomApps as DefaultApps } from "./app";
import type FMiscPlugin from "@/index";

export const StorageFileName = 'custom-webview-app.js';

export async function loadStorage(plugin: FMiscPlugin): Promise<IWebApp[]> {
    try {
        let data = await plugin.loadBlob(StorageFileName);
        // let jsModuleCode: string = await plugin.loadData(StorageFileName);
        if (!data) {
            throw new Error("Storage file not found");
        }

        // 创建一个 Blob URL 来动态导入模块
        // const blob = new Blob([jsModuleCode], { type: 'text/javascript' });
        let blob = new Blob([data], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);

        try {
            const module = await import(/* webpackIgnore: true */ url);
            URL.revokeObjectURL(url);  // 清理 URL
            const customApps = module.default as IWebApp[];
            return mergeWithDefault(customApps);
        } catch (importError) {
            URL.revokeObjectURL(url);  // 确保在出错时也清理 URL
            throw importError;
        }
    } catch (e) {
        // If storage file doesn't exist, create it with default apps
        await createDefaultStorage(plugin);
        return [...DefaultApps];
    }
}

function mergeWithDefault(customApps: IWebApp[]): IWebApp[] {
    const mergedApps = [...DefaultApps];

    customApps.forEach(newApp => {
        const existingIndex = mergedApps.findIndex(app => app.name === newApp.name);
        if (existingIndex !== -1) {
            mergedApps[existingIndex] = { ...mergedApps[existingIndex], ...newApp };
        } else {
            mergedApps.push(newApp);
        }
    });

    return mergedApps;
}

async function createDefaultStorage(plugin: FMiscPlugin) {
    const content = `\
/*
 * Custom WebView Apps Configuration
 * This file is auto-generated. You can modify it to customize your web apps.
 */

const customApps = ${JSON.stringify(DefaultApps, null, 4)};

export default customApps;
`;
    await plugin.saveBlob(StorageFileName, content);
}
