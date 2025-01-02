/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-02 10:46:11
 * @FilePath     : /src/func/quick-draft/index.tsx
 * @LastEditTime : 2025-01-02 16:04:00
 * @Description  : 
 */
import { onCleanup, onMount } from "solid-js";
import { getFrontend, openTab, openWindow, Protyle } from "siyuan";
import {
    app, createDalynote, formatSiYuanTimestamp, lsOpenedNotebooks, thisPlugin, translateHotkey

} from "@frostime/siyuan-plugin-kits";
// import { createSignalRef } from "@frostime/solid-signal-ref";
import { render } from "solid-js/web";
import { createDocWithMd, getBlockByID, removeDocByID } from "@frostime/siyuan-plugin-kits/api";
import { createSignalRef } from "@frostime/solid-signal-ref";
import FMiscPlugin from "@/index";

// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const InMiniWindow = () => {
    const body: HTMLElement = document.querySelector('body');
    return body.classList.contains('body--window');
}

function ProtyleComponent(props: { 
    blockId: string, autoDelete: boolean
}) {
    let divProtyle: HTMLDivElement | undefined;
    let protyle: Protyle | undefined;

    // const [delOnClose, setDelOnClose] = props.autoDelete.raw;
    const autoDelete = createSignalRef(props.autoDelete);

    const toggleFullScreen = (flag?: boolean) => {
        if (!divProtyle) return;
        divProtyle.classList.toggle('fullscreen', flag);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'y' && e.altKey) {
            toggleFullScreen();
        }
    }

    onMount(async () => {
        protyle = await initProtyle();
        if (!protyle) return;
        protyle.focus();
        // 监听 alt+y 快捷键来切换全屏
        document.addEventListener('keydown', handleKeyDown);
        toggleFullScreen(true);
        // 在 id="status" 元素中添加一个 checkbox，决定是否在关闭的时候删除文档
        const status = document.getElementById('status');
        if (status) {
            let div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '2px';

            const span = document.createElement('span');
            span.className = 'b3-label__text';
            span.textContent = '自动删除草稿';
            div.appendChild(span);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'delOnClose';
            checkbox.className = 'b3-switch';
            checkbox.checked = autoDelete();
            checkbox.addEventListener('change', () => {
                autoDelete.update(checkbox.checked);
            });
            div.appendChild(checkbox);
            status.insertBefore(div, status.firstChild);
        }
    });

    onCleanup(async () => {
        console.log('onCleanup', autoDelete());
        divProtyle = null;
        document.removeEventListener('keydown', handleKeyDown);
        protyle?.destroy();
        if (InMiniWindow() && autoDelete()) {
            await removeDocByID(props.blockId);
        }
    });

    async function initProtyle() {
        if (!divProtyle) return;
        let blockId = props.blockId;
        console.log('Open Protyle', blockId);
        return new Protyle(app, divProtyle, {
            blockId: blockId,
            render: {
                background: false,
                breadcrumb: true,
                breadcrumbDocName: true,
                title: false,
                scroll: true,
                gutter: true
            }
        });
    }

    return <div class="container" style="height: 100%; display: flex; flex-direction: column;">
        <div style="flex: 1;" ref={divProtyle} />
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

    let docTitle = title || formatSiYuanTimestamp();
    let newDocPath = doc.hpath + `/${docTitle}`;
    let newDocId = await createDocWithMd(doc.box, newDocPath, '\n');
    let plugin = thisPlugin();
    const tabOption = {
        icon: "iconCardBox",
        title: docTitle,
        data: {
            blockId: newDocId,
            autoDelete: title ? false : true
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
        height: 400,
        width: 750,
        tab: await tab
    });
}

export let name = "QuickNote";
export let enabled = false;
let disposer: () => void;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    // let plugin = thisPlugin();

    plugin.addTab({
        type: NEW_CARD_WINDOW_TYPE,
        async init() {
            if (!isWindow) return
            let blockId = this.data.blockId;
            disposer = render(
                () => <ProtyleComponent blockId={blockId} autoDelete={this.data.autoDelete} />,
                this.element
            );
        },
        async destroy() {
            console.log('关闭 QuickDraft 文档');
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
    });

    (plugin).registerMenuTopMenu('QuickDraft', [
        {
            icon: 'iconEdit',
            label: 'Quick Draft',
            click: () => {
                openQuickDraft();
            }
        }
    ]);

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

