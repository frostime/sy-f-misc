/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 17:06:29
 * @FilePath     : /src/func/toggl/func/record-to-dn.ts
 * @LastEditTime : 2025-01-02 01:25:25
 * @Description  : 
 */
import { sql, updateBlock, prependBlock, setBlockAttrs } from "@/api";

import * as api from '../api';

import { showMessage } from "siyuan";
import { formatDate, formatSeconds, startOfToday } from "../utils/time";
import { checkDailynoteToday } from "../utils/dailynote";
import { TimeEntry } from "../api/types";
import { formatDateTime } from "@frostime/siyuan-plugin-kits";
import { createEffect } from "solid-js";
import { config } from "../state/config";


const entriesToMd = (entries: TimeEntry[]) => {
    let items = entries.map(entry => {
        let start = formatDateTime('yyyy-MM-dd HH:mm:ss', new Date(entry.start));
        let stop = entry.stop ? formatDateTime('yyyy-MM-dd HH:mm:ss', new Date(entry.stop)) : '--:--:--';

        let duration = entry.stop ? formatSeconds(entry.duration) : '进行中';

        let item = `- **${entry.description}**`;
        item += `\n    - **时间段**: ${start} ~ ${stop}`
        item += `\n    - **持续时间**: ${duration}`
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

        if (config().dailynoteBox === '') {
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
            await updateBlock('markdown', markdown, blockId);
            setBlockAttrs(blockId, { [attrName]: attrValue })
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

let timer: ReturnType<typeof setInterval> | null = null;
let endOfDayTimer: ReturnType<typeof setTimeout> | null = null;
const clearTimers = () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    if (endOfDayTimer) {
        clearTimeout(endOfDayTimer);
        endOfDayTimer = null;
    }
}

const scheduleEndOfDayTask = () => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 0, 0); // 设置到当天的 23:59:00

    const timeUntilEndOfDay = endOfDay.getTime() - now.getTime();

    if (timeUntilEndOfDay > 0) {
        endOfDayTimer = setTimeout(() => {
            console.debug('在一天结束前一分钟执行 toggl 记录获取');
            recordTodayEntriesToDN();
        }, timeUntilEndOfDay);
    }
}

export const toggleAutoFetch = (enable: boolean) => {
    console.log('ToggleAutoFetch', enable);
    if (enable === false) {
        clearTimers();
    } else {
        //为了避免多个设备同时执行自动获取造成文档冲突, 只在特定设备上执行自动获取
        if (config().topDevice !== window.siyuan.config.system.id) {
            console.log('非主设备, 不执行自动获取');
            return;
        }

        if (timer === null) {
            const interval = config().dnAutoFetchInterval * 60 * 1000;
            timer = setInterval(() => {
                console.debug('自动获取 toggl 记录');
                recordTodayEntriesToDN();
            }, interval);
            console.info(`开始自动获取 toggl 记录, 间隔 ${config().dnAutoFetchInterval} 分钟`);
        }
        if (endOfDayTimer === null) {
            // 调度一天结束前一分钟的任务
            scheduleEndOfDayTask();
        }
    }
}
createEffect(() => {
    toggleAutoFetch(config().dnAutoFetch);
});
