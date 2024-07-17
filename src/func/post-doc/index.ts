/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-17 11:55:32
 * @FilePath     : /src/func/post-doc/index.ts
 * @LastEditTime : 2024-07-17 21:13:51
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import { post } from "./core";
import { type EventMenu, type IGetDocInfo, type IProtyle } from "siyuan";

const postDoc = (srcDoc: {
    name: string,
    docId: DocumentId
}) => {
    let target: ITraget = null;
    target.box + target.path; 
    let path = `/data/${target.box}${target.path}/${srcDoc.docId}.sy`;
    post({
        src: {
            doc: srcDoc.docId,
            recursive: false
        },
        target: {
            ip: '172.16.25.64',
            port: 6806,
            token: 'm2vh3v1fpobm1ksg',
            box: '20240717113959-40g3nwy',
            path: `/data/20240717113959-40g3nwy/${srcDoc.docId}.sy`
        }
    })
}

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
            postDoc({
                name, docId: rootID
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