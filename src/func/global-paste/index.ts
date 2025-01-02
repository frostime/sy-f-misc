/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-30 12:57:35
 * @FilePath     : /src/func/global-paste/index.ts
 * @LastEditTime : 2025-01-02 18:10:43
 * @Description  : 处理思源全局的 paste 事件
 */
import type FMiscPlugin from "@/index";

export let name = "GlobalPaste";
export let enabled = false;

export const declareToggleEnabled = {
    title: '📋 全局粘贴',
    description: '启用全局粘贴处理功能',
    defaultEnabled: false
};

const processors: {[key: string]: (detail: ISiyuanEventPaste) => boolean} = {
    bilibili: (detail: ISiyuanEventPaste) => {
        const pat = /^((?:【.+】\s*)+)\s*(https:\/\/www\.bilibili\.com.+)$/
        const match = detail.textPlain.match(pat);
        if (!match) return false;
        let title = match[1];
        let link = match[2];
        detail.resolve({
            textPlain: `[${title}](${link})`,
            textHTML: undefined,
            files: detail.files,
            siyuanHTML: detail.siyuanHTML
        });
        return true;
    },
    url: (detail: ISiyuanEventPaste) => {
        const pat = /^(https?:\/\/\S+)$/;
        const match = detail.textPlain.match(pat);
        if (!match) return false;
        let link = match[1];
        detail.resolve({
            textPlain: `[${link}](${link})`,
            textHTML: undefined,
            files: detail.files,
            siyuanHTML: detail.siyuanHTML
        });
        return true;
    }
};

export const addProcessor = (key: string, processor: (detail: ISiyuanEventPaste) => boolean) => {
    processors[key] = processor;
}

export const delProcessor = (key: string) => {
    delete processors[key];
}

export const onPaste = async (event: CustomEvent<ISiyuanEventPaste>) => {
    const detail = event.detail;
    for (const key in processors) {
        if (processors[key](detail) === false) continue;
        console.debug(`Paste processor ${key} matched`);
        return;
    }
}

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.eventBus.on('paste', onPaste);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.eventBus.off('paste', onPaste);
} 