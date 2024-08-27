/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 17:06:29
 * @FilePath     : /src/func/toggl/func/record-to-dn.ts
 * @LastEditTime : 2024-08-27 17:52:27
 * @Description  : 
 */
import { sql, updateBlock, prependBlock } from "@/api";

import * as api from '../api';
import * as store from '../store';

import { showMessage } from "siyuan";
import { formatDate, formatSeconds, startOfToday } from "../utils/time";
import { checkDailynoteToday } from "../utils/dailynote";
import { TimeEntry } from "../api/types";
import { formatDateTime } from "@/utils/time";


const entriesToMd = (entries: TimeEntry[]) => {
    let items = entries.map(entry => {
        let start = formatDateTime('yyyy-MM-dd HH:mm:ss', new Date(entry.start));
        let stop = entry.stop ? formatDateTime('yyyy-MM-dd HH:mm:ss', new Date(entry.stop)) : '--:--:--';

        let duration = entry.stop ? formatSeconds(entry.duration) : '进行中';

        let item = `- [${duration}] **${entry.description}**: ${start} ~ ${stop}`;

        if (entry.project_id) item += `\n    - **项目**: ${entry.project_id}`
        if (entry.tags && entry.tags.length > 0) item += `\n    - **标签**: #${entry.tags.join(', #')}`
        return item;
    });
    return items.join('\n');
}


/**
 * 将今天的 toggl 活动记录到 daily note 中
 */
export const recordTodayEntriesToDN = async () => {

    const updateRecordNote = async (markdown: string) => {

        if (store.config.dailynoteBox === '') {
            showMessage('请填写笔记本 ID', 4000, 'error');
            return;
        }

        const attrName = 'custom-toggl-time-entries';
        const attrValue = formatDate(new Date());

        let blocks = await sql(`
            SELECT B.*
            FROM blocks AS B
            WHERE B.id IN (
                SELECT A.block_id
                FROM attributes AS A
                WHERE A.name = '${attrName}'
                AND A.value = '${attrValue}'
            );
        `);

        let blockId = null;
        if (blocks === null || blocks.length === 0) {
            const dnId = await checkDailynoteToday();
            await prependBlock('markdown', `${markdown}\n{: ${attrName}="${attrValue}" }`, dnId);
        } else {
            blockId = blocks[0].id;
            updateBlock('markdown', markdown, blockId);
        }

    }

    let response = await api.timeEntries.getTimeEntries({
        since: startOfToday()
    });

    if (!response.ok) {
        showMessage(`[${response.status}] 获取 toggl 记录失败`, 4000, 'error');
    }

    let entries = response.data;
    if (entries.length === 0) {
        showMessage('今天没有 toggl 记录', 4000, 'info');
        return;
    }

    let markdown = entriesToMd(entries);
    await updateRecordNote(markdown);
    showMessage('已将 toggl 记录添加到 daily note 中', 4000, 'info');
}
