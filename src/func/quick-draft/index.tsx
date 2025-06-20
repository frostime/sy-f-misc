/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-02 10:46:11
 * @FilePath     : /src/func/quick-draft/index.tsx
 * @LastEditTime : 2025-06-13 12:53:35
 * @Description  : 
 */
import { onCleanup, onMount } from "solid-js";
import { getFrontend, openTab, openWindow, Protyle, showMessage } from "siyuan";
import {
    app, createDailynote, debounce, formatSiYuanTimestamp, inputDialog, lsOpenedNotebooks, matchIDFormat, thisPlugin, translateHotkey

} from "@frostime/siyuan-plugin-kits";
// import { createSignalRef } from "@frostime/solid-signal-ref";
import { render } from "solid-js/web";
import { createDocWithMd, getBlockByID, removeDocByID, renameDocByID } from "@frostime/siyuan-plugin-kits/api";
import { createSignalRef } from "@frostime/solid-signal-ref";
import FMiscPlugin from "@/index";
import { defaultConstants } from "../shared-configs";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const InMiniWindow = () => {
    const body: HTMLElement = document.querySelector('body');
    return body.classList.contains('body--window');
}

function ProtyleComponent(props: {
    blockId: string, autoDelete: boolean, zenMode: boolean
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

        let block = await getBlockByID(props.blockId);

        // 监听 alt+y 快捷键来切换全屏
        document.addEventListener('keydown', handleKeyDown);

        if (props.zenMode === true) {
            toggleFullScreen(true);
        } else {
            toggleFullScreen(false);
        }
        // 在 id="status" 元素中添加一个 checkbox，决定是否在关闭的时候删除文档
        const status = document.getElementById('status');
        if (status) {
            let div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '2px';

            const span = document.createElement('span');
            span.className = 'b3-label__text';
            span.textContent = '自动删除';
            span.style.overflow = 'hidden';
            span.style.textOverflow = 'ellipsis';
            span.style.whiteSpace = 'nowrap';
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

            div.appendChild(document.createElement('span'));
            let documentTitle = document.createElement('span');
            documentTitle.textContent = block.content;
            documentTitle.className = 'b3-label__text';
            documentTitle.style.overflow = 'hidden';
            documentTitle.style.textOverflow = 'ellipsis';
            documentTitle.style.whiteSpace = 'nowrap';
            div.appendChild(documentTitle);

            documentTitle.onclick = () => {
                inputDialog({
                    title: '修改文档标题',
                    defaultText: block.content,
                    confirm: async (value: string) => {
                        // 手动更改了标题，说明有价值，不自动删除
                        autoDelete(false);
                        checkbox.checked = false;
                        await renameDocByID(props.blockId, value);
                        block.content = value;
                        let item = document.querySelector(`li[data-type="tab-header"][aria-label="${block.content}"] > span.item__text`);
                        if (item) {
                            // item.click();
                            item.textContent = value;
                        }
                    }
                });
            }

            status.insertBefore(div, status.firstChild);
        }

        // 双击 tab 标签页进行固定
        const tabHeader = document.querySelector('li[data-type="tab-header"]');
        const doubleClickEvent = new MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        tabHeader?.dispatchEvent(doubleClickEvent);
        tabHeader?.classList.toggle('item--unupdate', false);

        if (props.autoDelete) {
            setTimeout(() => {
                showMessage('临时草稿，关闭后自动删除!', 2500);
            }, 300);
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
let DEFAULT_BOX = '';
let DEFAULT_AUTO_DELETE = true;
let DEFAULT_ZEN_MODE = true;

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'quick-draft',
    load: (data: { box: string, autoDelete: boolean, zenMode: boolean }) => {
        data.box && (DEFAULT_BOX = data.box);
        data.autoDelete !== undefined && (DEFAULT_AUTO_DELETE = data.autoDelete);
        data.zenMode !== undefined && (DEFAULT_ZEN_MODE = data.zenMode);
    },
    items: [
        {
            key: 'box',
            title: 'Quick Draft 默认笔记本',
            description: 'Quick Draft 存放 Quick Draft 的默认笔记本',
            type: 'textinput',
            get: () => DEFAULT_BOX,
            set: (value: string) => {
                DEFAULT_BOX = value;
            }
        },
        {
            key: 'autoDelete',
            title: '自动删除草稿',
            description: 'Draft 关闭后自动删除草稿',
            type: 'checkbox',
            get: () => DEFAULT_AUTO_DELETE,
            set: (value: boolean) => {
                DEFAULT_AUTO_DELETE = value;
            }
        },
        {
            key: 'zenMode',
            title: '默认 Zen 模式',
            description: 'Quick Draft 打开时是否进入 Zen 模式',
            type: 'checkbox',
            get: () => DEFAULT_ZEN_MODE,
            set: (value: boolean) => {
                DEFAULT_ZEN_MODE = value;
            }
        }
    ]
}

export const openQuickDraft = async (title?: string) => {
    if (isWindow) return;

    let notebooks = await lsOpenedNotebooks();
    let box = DEFAULT_BOX;
    if (!matchIDFormat(DEFAULT_BOX) && notebooks?.length > 0) {
        box = notebooks[0].id;
        DEFAULT_BOX = box;
    }
    let dnId = await createDailynote(box);
    let doc = await getBlockByID(dnId);
    let retry = 1;
    while (!doc) {
        console.debug(`Retry: ${retry}`);
        await sleep(500);
        doc = await getBlockByID(dnId);
        if (retry > 5) {
            showMessage('创建笔记草稿失败，请稍后再试', 2500);
            return;
        }
        retry++;
    }

    let docTitle = title || formatSiYuanTimestamp();
    let newDocPath = doc.hpath + `/${docTitle}`;
    let newDocId = await createDocWithMd(doc.box, newDocPath, '\n');
    let plugin = thisPlugin();
    const tabOption = {
        icon: "iconCardBox",
        title: docTitle,
        data: {
            blockId: newDocId,
            autoDelete: title ? false : DEFAULT_AUTO_DELETE,
            zenMode: DEFAULT_ZEN_MODE
        },
        id: plugin.name + NEW_CARD_WINDOW_TYPE
    };
    const tab = openTab({
        app: app,
        custom: tabOption,
        removeCurrentTab: false,
    });

    openWindow({
        height: defaultConstants?.quickDraftWinSize?.height || 600,
        width: defaultConstants?.quickDraftWinSize?.width || 1000,
        tab: await tab
    });
}

const openQuickDraftDebounced = debounce(openQuickDraft, 1000);

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
                () => <ProtyleComponent blockId={blockId} autoDelete={this.data.autoDelete} zenMode={this.data.zenMode} />,
                this.element
            );
        },
        async destroy() {
            // console.log('关闭 QuickDraft 文档');
            disposer?.();
            disposer = () => { };
        }
    });


    plugin.addCommand({
        langKey: "openQuickDraftWindow",
        langText: "打开新窗口以新建笔记草稿",
        hotkey: translateHotkey("Shift+Alt+G"),
        globalCallback: () => {
            openQuickDraftDebounced();
        }
    });

    (plugin).registerMenuTopMenu('QuickDraft', [
        {
            icon: 'iconEdit',
            label: 'Quick Draft',
            click: () => {
                openQuickDraftDebounced();
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
    defaultEnabled: false
};

