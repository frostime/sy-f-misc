/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-19 21:06:07
 * @FilePath     : /src/libs/dailynote.ts
 * @LastEditTime : 2024-12-18 22:58:43
 * @Description  : From git@github.com:frostime/siyuan-dailynote-today.git
 */
import { formatDateTime } from "@frostime/siyuan-plugin-kits";
import { getNotebookConf, renderSprig } from "@/api";

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

    // let dateStr = formatDate(date, '-');
    let dateStr = formatDateTime('yyyy-MM-dd', date);
    let sprig = `toDate "2006-01-02" "${dateStr}"`;

    dnSprig = dnSprig.replaceAll(/now/g, sprig);

    let hpath = await renderSprig(dnSprig)

    return hpath;
}
