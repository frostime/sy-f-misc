/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-19 21:06:07
 * @FilePath     : /src/libs/dailynote.ts
 * @LastEditTime : 2024-10-19 22:38:31
 * @Description  : From git@github.com:frostime/siyuan-dailynote-today.git
 */

import { formatDate } from "@/utils/time";
import { createDocWithMd, getNotebookConf, renderSprig, setBlockAttrs, sql } from "@/api";

/**
 * 对 DailyNote 的自定义属性进行设置, custom-dailynote-yyyyMMdd: yyyyMMdd
 * https://github.com/siyuan-note/siyuan/issues/9807
 * @param doc_id 日记的 id
 */
export async function setCustomDNAttr(doc_id: string, date?: Date) {
    let td = formatDate(date);
    let attr = `custom-dailynote-${td}`;
    // 构建 attr: td
    let attrs: { [key: string]: string } = {};
    attrs[attr] = td;
    await setBlockAttrs(doc_id, attrs);
}

export const getPastDNHPath = async (boxId: NotebookId, date: Date): Promise<string> => {


    const notebookConf = await getNotebookConf(boxId);

    if (notebookConf === undefined) {
        return null;
    }

    let dnSprig = notebookConf.conf?.dailyNoteSavePath;
    if (dnSprig === undefined) {
        // throw new Error('DailyNoteToday: 请先设置日记本');
        return null;
    }

    let dateStr = formatDate(date, '-');
    let sprig = `toDate "2006-01-02" "${dateStr}"`;

    dnSprig = dnSprig.replaceAll(/now/g, sprig);

    let hpath = await renderSprig(dnSprig)

    return hpath;
}

export async function createDiary(boxId: NotebookId, todayDiaryHpath: string, date?: Date) {
    let doc_id = await createDocWithMd(boxId, todayDiaryHpath, "");

    console.debug(`创建日记: ${boxId} ${todayDiaryHpath}`);
    await setCustomDNAttr(doc_id, date);

    return doc_id;
}

export const searchDailynote = async (boxId: NotebookId, date: Date): Promise<string> => {
    const dateStr = formatDate(date);
    const query = `
        SELECT B.*
        FROM blocks AS B
        WHERE B.type = 'd' AND B.box = '${boxId}' AND B.id IN (
            SELECT A.block_id
            FROM attributes AS A
            WHERE A.name = 'custom-dailynote-${dateStr}'
        );
        `;
    const docs = await sql(query);
    return docs?.[0]?.id ?? null;
}
