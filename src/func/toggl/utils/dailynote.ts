/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 15:53:33
 * @FilePath     : /src/func/toggl/utils/dailynote.ts
 * @LastEditTime : 2024-12-19 00:54:49
 * @Description  : 
 */
import { formatDate } from "./time";
import { sql, request } from "@/api";
import * as store from '../store';
import { findPlugin } from "@frostime/siyuan-plugin-kits";


const queryDailynoteToday = async () => {
    let td = formatDate(new Date());
    const query = `
    select distinct B.* from blocks as B join attributes as A
    on B.id = A.block_id
    where A.name = 'custom-dailynote-${td}' and B.box = '${store.config.dailynoteBox}'
    `;
    const blocks: Block[] = await sql(query);
    return blocks.length > 0? blocks[0] : null;
}

/**
 * 检查是否存在; 不错在就创建;
 */
export const checkDailynoteToday = async () => {
    const dn = await queryDailynoteToday();
    if (dn) return dn.id;

    let url = '/api/filetree/createDailyNote';
    let app = findPlugin('sy-f-misc').app;
    let ans = await request(url, { notebook: store.config.dailynoteBox, app: app?.appId });
    let docId = ans.id;
    return docId;
}

