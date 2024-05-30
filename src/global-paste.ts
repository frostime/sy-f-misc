/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-30 12:57:35
 * @FilePath     : /src/global-paste.ts
 * @LastEditTime : 2024-05-30 21:15:04
 * @Description  : 处理思源全局的 paste 事件
 */

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