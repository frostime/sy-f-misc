/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-17 11:55:32
 * @FilePath     : /src/func/post-doc/index.ts
 * @LastEditTime : 2024-07-17 13:33:14
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import { post } from "./core";
import { type EventMenu, type IGetDocInfo, type IProtyle } from "siyuan";

const clickDocIcon = async (event: CustomEvent<{
    menu: EventMenu,
    protyle: IProtyle,
    data: IGetDocInfo,
}>) => {
    let detail = event.detail;
    let {name, rootID} = detail.data;

    detail.menu.addItem({
        icon: 'iconEmoji',
        label: 'Post Doc',
        click: () => {
            post({
                src: {
                    doc: rootID,
                    recursive: false
                },
                target: {
                    ip: '172.16.25.64',
                    port: 6806,
                    token: 'm2vh3v1fpobm1ksg',
                    box: '20240717113959-40g3nwy',
                    path: `/data/20240717113959-40g3nwy/${rootID}.sy`
                }
            })
        }
    });
}

export let name = "PostDoc";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    plugin.eventBus.on('click-editortitleicon', clickDocIcon);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;

    plugin.eventBus.off('click-editortitleicon', clickDocIcon);

}