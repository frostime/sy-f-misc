/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-17 11:55:32
 * @FilePath     : /src/func/post-doc/index.ts
 * @LastEditTime : 2024-07-18 15:20:50
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import { post } from "./core";
import { type EventMenu, type IGetDocInfo, type IProtyle } from "siyuan";

import SelectTarget from "./select-target";

import { solidDialog } from "@/libs/dialog";
import { getBlockAttrs, setBlockAttrs } from "@/api";


const ATTR_NAME = 'custom-push-doc-history';

const postDoc = async (srcDoc: {
    name: string,
    docId: DocumentId
}) => {
    // let target: ITraget = null;

    let attrs = await getBlockAttrs(srcDoc.docId);

    let history: IPostProps = attrs[ATTR_NAME] ? JSON.parse(attrs[ATTR_NAME]) : null;

    const doPost = (target: ITraget, recursive: boolean) => {
        console.log(target);

        let payload = {};
        let props: IPostProps = {
            src: {
                doc: srcDoc.docId,
                recursive: recursive
            },
            target: {
                ...target
            }
        };
        payload[ATTR_NAME] = JSON.stringify(props);
        setBlockAttrs(srcDoc.docId, payload);

        post(props);
    }



    const dialog = solidDialog({
        title: '推送目标',
        loader: () => SelectTarget({
            confirm: doPost,
            close: () => dialog.destroy(),
            history: history?.target,
            recursive: history?.src?.recursive ?? false
        }),
        width: '500px'
    });
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

export const declareToggleEnabled = {
    title: '📤 推送文档发布远端',
    description: '启用推送文档发布远端功能',
    defaultEnabled: false
};

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