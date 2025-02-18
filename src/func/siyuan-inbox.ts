/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-06 15:42:29
 * @FilePath     : /src/func/siyuan-inbox.ts
 * @LastEditTime : 2025-02-18 11:33:11
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import { request } from "@frostime/siyuan-plugin-kits/api";
import { formatDate } from "./toggl/utils/time";
// import { createDailynote } from "@frostime/siyuan-plugin-kits";


interface IInboxMessage {
    hCreated: string;
    oId: string;
    shorthandMd: string;
    shorthandDesc: string;
    shorthandTitle: string;
}

const getInboxMessage = async () => {
    const data = await request('/api/inbox/getShorthands', {
        page: 1,
    });
    if (!data || data?.code !== 0) return null;

    let shorthands = data.data.shorthands as IInboxMessage[];
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    //简单粗糙的做法，微信发过来的消息，标题总是日期
    shorthands = shorthands.filter(item => datePattern.test(item.shorthandTitle));

    const msgMaps = {};
    shorthands.forEach(item => {
        let hCreated = item.hCreated.split(' ')[0];
        if (!msgMaps[hCreated]) {
            msgMaps[hCreated] = [];
        }
        item.shorthandMd = `[${item.hCreated}] ${item.shorthandMd}`;
        msgMaps[hCreated].push(item);


    });
    return {
        msgs: msgMaps,
        today: (): IInboxMessage[] => {
            let date = formatDate(new Date(), '-');
            return msgMaps[date] || [];
        },
        remove: async (oid: string) => {
            await request('/api/inbox/removeShorthands', {
                ids: [oid]
            })
        }

    }
};


export let name = "SiYuanInbox";

export let enabled = false;

// Optional: Configure module settings

export const declareToggleEnabled = {
    title: "收集箱工具",
    description: "收集箱工具, 将微信转发的简单消息直接插入到日记当中",
    defaultEnabled: false
};


export const allowToUse = () => window.siyuan.user.userName === "Frostime";

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.registerMenuTopMenu('wechat-today', [
        {
            label: '本日微信消息',
            icon: 'inbox',
            click: async () => {
                const msgs = await getInboxMessage();
                if (!msgs) return;
                if (msgs.today().length === 0) return;
                const today = msgs.today();
                // const dn = await createDailynote()
            }
        }
    ])
};


export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.unRegisterMenuTopMenu('wechat-today');
};