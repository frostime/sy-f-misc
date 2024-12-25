/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:31:26
 * @FilePath     : /src/func/gpt/persistence/json-files.ts
 * @LastEditTime : 2024-12-26 00:41:20
 * @Description  : 
 */
import { thisPlugin, api, matchIDFormat } from "@frostime/siyuan-plugin-kits";

const rootName = 'chat-history';

export const saveToJson = (history: IChatSessionHistory) => {
    const plugin = thisPlugin();

    const filepath = `${rootName}/${history.id}.json`;
    plugin.saveData(filepath, { ...history });
}


export const tryRecoverFromJson = async (filePath: string) => {
    // const plugin = thisPlugin();
    const blob = await api.getFileBlob(filePath);
    // 空?
    if (!blob) {
        return null;
    }
    // 解析json
    try {
        //application json
        let text = await blob.text();
        return JSON.parse(text);
    } catch (e) {
        console.warn(`Failed to parse json file: ${filePath}`, e);
        return null;
    }
}


export const listFromJson = async (): Promise<IChatSessionHistory[]> => {
    const dir = `data/storage/petal/${thisPlugin().name}/${rootName}/`;
    const files = await api.readDir(dir);
    if (!files) return [];

    let filename = files.filter(f => !f.isDir).map(f => f.name).filter(f => f.endsWith('.json'));
    filename = filename.filter((f) => {
        const name = f.split('.').slice(0, -1);
        if (matchIDFormat(name[0])) return true;
        return false;
    })

    let promises = filename.map(async f => {
        const content = await tryRecoverFromJson(`${dir}${f}`);
        if (!content) return null;
        return content
    });
    let storages: any[] = await Promise.all(promises);
    return storages.filter(s => s) as IChatSessionHistory[];
}

export const getFromJson = async (id: string): Promise<IChatSessionHistory> => {
    const dir = `data/storage/petal/${thisPlugin().name}/${rootName}/`;
    const filepath = `${dir}${id}.json`;
    const content = await tryRecoverFromJson(filepath);
    return content as IChatSessionHistory;
}


export const removeFromJson = async (id: string) => {
    const plugin = thisPlugin();
    const filepath = `${rootName}/${id}.json`;
    await plugin.removeData(filepath);
}
