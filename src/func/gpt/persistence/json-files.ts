/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:31:26
 * @FilePath     : /src/func/gpt/persistence/json-files.ts
 * @LastEditTime : 2024-12-23 17:47:28
 * @Description  : 
 */
import { formatDateTime, thisPlugin } from "@frostime/siyuan-plugin-kits";

const rootName = 'chat-history';

export const saveToJson = (history: IChatSessionHistory) => {
    const plugin = thisPlugin();

    let { items, title, timestamp } = history;
    let titlename = title || `GPT 导出文档`;
    titlename = history.id + '$$' + titlename + '$$' + new Date().getTime();

    const content = {
        title: titlename,
        timestamp: timestamp,
        items: items
    };

    const filepath = `${rootName}/${titlename}.json`;
    plugin.saveData(filepath, content);
}
