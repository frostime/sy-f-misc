/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:31:26
 * @FilePath     : /src/func/gpt/persistence/json-files.ts
 * @LastEditTime : 2024-12-23 19:19:17
 * @Description  : 
 */
import { thisPlugin, api } from "@frostime/siyuan-plugin-kits";

const rootName = 'chat-history';

export const saveToJson = (history: IChatSessionHistory) => {
    const plugin = thisPlugin();

    let { items, id, timestamp } = history;

    const content = {
        title: id,
        timestamp: timestamp,
        items: items
    };

    const filepath = `${rootName}/${id}.json`;
    plugin.saveData(filepath, content);
}


export const tryRecoverFromJson = async (id: string) => {
    const plugin = thisPlugin();
    const path = `data/plugins/${plugin.name}/${rootName}/${id}.json`;
    const blob = await api.getFileBlob(path);
    // 空?
    if (!blob) {
        return null;
    }
    // 解析json
    try {
        const content = blob.toString();
        return JSON.parse(content);
    } catch (e) {
        console.error(`Failed to parse json file: ${path}`, e);
        return null;
    }
}
