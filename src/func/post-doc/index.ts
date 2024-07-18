/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-17 11:55:32
 * @FilePath     : /src/func/post-doc/index.ts
 * @LastEditTime : 2024-07-18 14:37:12
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

        target.box + target.path; 
        let path = `/data/${target.box}${target.path}/${srcDoc.docId}.sy`;
        props.target.path = path;
        // post({
        //     src: {
        //         doc: srcDoc.docId,
        //         recursive: false
        //     },
        //     target: {
        //         ip: '172.16.25.64',
        //         port: 6806,
        //         token: 'm2vh3v1fpobm1ksg',
        //         box: '20240717113959-40g3nwy',
        //         path: `/data/20240717113959-40g3nwy/${srcDoc.docId}.sy`
        //     }
        // })
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