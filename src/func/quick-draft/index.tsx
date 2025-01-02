/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-02 10:46:11
 * @FilePath     : /src/func/quick-draft/index.tsx
 * @LastEditTime : 2025-01-02 14:05:04
 * @Description  : 
 */
import { onCleanup, onMount } from "solid-js";
import { getFrontend, openTab, openWindow, Protyle } from "siyuan";
import {
    app, confirmDialog, createDalynote, formatSiYuanTimestamp, lsOpenedNotebooks, thisPlugin, translateHotkey

} from "@frostime/siyuan-plugin-kits";
// import { createSignalRef } from "@frostime/solid-signal-ref";
import { render } from "solid-js/web";
import { createDocWithMd, deleteBlock, getBlockByID } from "@frostime/siyuan-plugin-kits/api";

// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// const blockToOpen = createSignalRef<string>(null);

function ProtyleComponent(props: { blockId: string }) {
    let divProtyle: HTMLDivElement | undefined;
    let protyle: Protyle | undefined;

    onMount(async () => {
        protyle = await initProtyle();
        if (!protyle) return;

        // let block = await getBlockByID(props.blockId);

        protyle.focus();

        // // 给当前的 window 添加关闭前的监听回调
        // window.addEventListener('beforeunload', async () => {
        //     return new Promise(resolve => {
        //         confirmDialog({
        //             title: '删除草稿?',
        //             content: '是否删除草稿?',
        //             confirm: async () => {
        //                 await deleteBlock(props.blockId);
        //                 resolve(true);
        //             },
        //             cancel: () => {
        //                 resolve(false);
        //             }
        //         });
        //     });
        // });
    });

    onCleanup(async () => {
        protyle?.destroy();
        divProtyle = null;
    });

    async function initProtyle() {
        if (!divProtyle) return;
        let blockId = props.blockId;
        console.log('Open Protyle', blockId);
        return new Protyle(app, divProtyle, {
            blockId: blockId,
            render: {
                background: false,
                breadcrumb: false,
                breadcrumbDocName: false,
                scroll: true,
                gutter: true
            }
        });
    }

    return <div class="container" style="height: 100%;">
        <div style="height: 100%;" ref={divProtyle} />
    </div>;
}

const NEW_CARD_WINDOW_TYPE = "new-card-window";
let isWindow = getFrontend() === "desktop-window";
const DEFAULT_BOX = '20220305173526-4yjl33h';

export const openQuickDraft = async (title?: string) => {
    if (isWindow) return;

    let notebooks = await lsOpenedNotebooks();
    let box = DEFAULT_BOX;
    if (notebooks?.length > 0) {
        box = notebooks[0].id;
    }
    let dnId = await createDalynote(box);
    let doc = await getBlockByID(dnId);

    title = title || formatSiYuanTimestamp();
    let newDocPath = doc.hpath + `/${title}`;
    let newDocId = await createDocWithMd(doc.box, newDocPath, '\n');
    let plugin = thisPlugin();
    const tabOption = {
        icon: "iconCardBox",
        title: "新建卡片",
        data: {
            blockId: newDocId
        },
        id: plugin.name + NEW_CARD_WINDOW_TYPE
    };
    const tab = openTab({
        app: app,
        custom: tabOption,
        removeCurrentTab: false,
    })
    // const screenWidth = window.screen.availWidth;
    // const screenHeight = window.screen.availHeight;
    openWindow({
        height: 500,
        width: 600,
        tab: await tab
    });
}

export let name = "QuickNote";
export let enabled = false;
let disposer: () => void;
export const load = () => {
    if (enabled) return;
    enabled = true;

    let plugin = thisPlugin();

    plugin.addTab({
        type: NEW_CARD_WINDOW_TYPE,
        async init() {
            if (!isWindow) return
            let blockId = this.data.blockId;
            disposer = render(() => <ProtyleComponent blockId={blockId} />, this.element);
        },
        async beforeDestroy() {
            disposer?.();
            disposer = () => { };
        }
    });


    plugin.addCommand({
        langKey: "openQuickDraftWindow",
        langText: "打开新窗口以新建笔记草稿",
        hotkey: translateHotkey("Shift+Alt+G"),
        globalCallback: () => {
            openQuickDraft();
        }
    })

}

export const unload = () => {
    if (!enabled) return;
    enabled = false;
    let plugin = thisPlugin();
    plugin.delCommand("openQuickDraftWindow");
    disposer?.();
}


export const declareToggleEnabled = {
    title: '💡 QuickDraft',
    description: '快速创建笔记草稿',
    defaultEnabled: true
};

