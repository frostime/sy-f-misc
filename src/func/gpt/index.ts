/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-19 21:52:17
 * @FilePath     : /src/func/gpt/index.ts
 * @LastEditTime : 2025-01-23 17:22:12
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import { openCustomTab, thisPlugin } from "@frostime/siyuan-plugin-kits";

import { render } from "solid-js/web";

import ChatSession from "./components/ChatSession";
import { translateHotkey } from "@/libs/hotkey";
import * as setting from "./setting";
import { ISignalRef, useSignalRef } from "@frostime/solid-signal-ref";
import { id2block } from "./utils";

import * as persist from './persistence';
import { showMessage } from "siyuan";
import { solidDialog } from "@/libs/dialog";
import HistoryList from "./components/HistoryList";
import { globalMiscConfigs } from "./setting/store";

export let name = "GPT";
export let enabled = false;
export const declareToggleEnabled = {
    title: '🤖 ChatGPT',
    description: '使用GPT进行对话',
    defaultEnabled: false
};
export const declareSettingPanel = [
    {
        key: 'GPT',
        title: '🤖 GPT',
        element: setting.GlobalSetting
    }
]

const attachSelectedText = async () => {
    // 获取光标所在位置
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return '';
    }

    // 获取对应的 element
    const range = selection.getRangeAt(0);
    const element = range?.startContainer.parentElement.closest('.protyle-wysiwyg');

    if (!element) return '';

    let nodes = element.querySelectorAll('.protyle-wysiwyg--select');
    if (nodes.length === 0) {
        const selectedText = selection.toString().trim();
        if (!selectedText) {
            return '';
        }

        return `\n\n${globalMiscConfigs().userSelectedContextFormat.replace('{{content}}', selectedText)}`;
    }

    let blocksIds = [];
    nodes.forEach((node: HTMLElement) => {
        blocksIds.push(node.dataset.nodeId);
    });
    let blocks: Block[] = await id2block(...blocksIds);
    let blocksMap = new Map(blocks.map(block => [block.id, block]));
    let sortedBlocks = blocksIds.map(id => blocksMap.get(id));
    let blockMarkdown = sortedBlocks.map((block) => block?.markdown || '');
    const content = blockMarkdown.join('\n\n').trim();
    const template = globalMiscConfigs().userSelectedContextFormat;
    const context = template.replace('{{content}}', content.replace(/\$/g, '$$$$'));
    return `\n\n${context}`;
}

let activeTabId = null;

/**
 * 外部传递给 Chat Session 的信号
 */
const outsideInputs = {}

// src/func/gpt/index.ts (70-112)
const openChatTab = async (reuse: boolean = true, history?: IChatSessionHistory) => {

    const prompt = await attachSelectedText();
    //input 用于在从外部给内部 Chat 添加文本内容
    let input: ISignalRef<string>;
    let tabId = 'gpt-chat' + new Date().getTime();
    if (reuse === true && activeTabId !== null) {
        tabId = activeTabId;
        input = outsideInputs[activeTabId];
        input.value = prompt;
    } else {
        activeTabId = tabId;
        input = useSignalRef(prompt);
        outsideInputs[activeTabId] = input;
    }
    let disposer = () => { };
    openCustomTab({
        tabId: tabId,
        render: (container: HTMLElement) => {
            disposer = render(() => ChatSession({
                input: input,
                history: history,
                updateTitleCallback: (title: string) => {
                    if (!title) return;
                    if (title.length > 30) {
                        title = title.slice(0, 30);
                        title += '...';
                    }
                    const plugin = thisPlugin();
                    const tabs = plugin.getOpenedTab();
                    let tab = tabs[tabId];
                    if (tab && tab?.[0]) {
                        let id = tab[0].tab.id;
                        let ele = document.querySelector(`li.item[data-id="${id}"] .item__text`);
                        if (ele) {
                            (ele as HTMLElement).innerText = title;
                        }
                    }
                }
            }), container);
            let tabContainer: HTMLElement = container.closest('[data-id]');
            if (tabContainer) {
                tabContainer.style.overflowY = 'clip';
                tabContainer.style.background = 'var(--chat-bg-color)';
                tabContainer.style.containerType = 'inline-size';
            }
        },
        beforeDestroy: () => {
            if (activeTabId === tabId) {
                activeTabId = null;
            }
            delete outsideInputs[tabId];
            disposer(); //调用 solidjs 的 onCleanup
        },
        title: history?.title || '和 GPT 对话',
        icon: 'iconGithub',
        position: prompt.trim() ? 'right' : undefined
    });
}


/**
 * 点击文档图标时触发的事件，用于打开绑定的 GPT 记录
 * @returns 
 */
export const useSyDocClickEvent = () => {
    let disposer = () => { };
    return {
        register: () => {
            const plugin = thisPlugin();
            disposer = plugin.registerOnClickDocIcon((detail) => {
                if (!detail.data.ial[persist.ATTR_GPT_EXPORT_DOC]) {
                    return;
                }
                const exportId = detail.data.ial[persist.ATTR_GPT_EXPORT_DOC];
                detail.menu.addItem({
                    label: '打开 GPT 记录',
                    icon: 'iconGithub',
                    click: async () => {
                        const history = await persist.getFromJson(exportId);
                        //@ts-ignore
                        if (!history || history?.code === 404) {
                            showMessage(`未找到 GPT 记录 ${exportId}`, 4000, 'error');
                            return;
                        }
                        openChatTab(false, history);
                    }
                })
            });
        },
        dispose: () => {
            disposer();
        }
    }
}

const clickEvent = useSyDocClickEvent();

const openUrl = async (e: CustomEvent<{ url: string }>) => {
    // const prefix = "siyuan://plugins/<plugin-name>/chat-session-history?historyId=xxx";
    const urlObj = new URL(e.detail.url);
    const method = urlObj.pathname.split('/').pop();
    if (method === 'chat-session-history') {
        const historyId = urlObj.searchParams.get('historyId');
        const history = await persist.getFromJson(historyId);
        if (!history) {
            showMessage(`未找到 GPT 记录 ${historyId}`, 4000, 'error');
            return;
        }
        openChatTab(false, history);
    }
}


const addSVG = (plugin: FMiscPlugin) => {
    if (document.querySelector('symbol#iconSendGpt')) return;
    const symbol = `<symbol id="iconSendGpt" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-slot="icon" class="size-5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z"></path></symbol>`;
    plugin.addIcons(symbol);
}

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.registerMenuTopMenu('gpt', [{
        label: '新建 GPT 对话',
        icon: 'iconGithub',
        click: () => {
            openChatTab(false);
        }
    }, {
        label: 'GPT 对话记录',
        icon: 'iconGithub',
        click: () => {
            const { close } = solidDialog({
                title: '历史记录',
                loader: () => (
                    HistoryList({
                        close: () => close(),
                        onclick: (history: IChatSessionHistory) => {
                            openChatTab(false, history);
                        }
                    })
                ),
                width: '600px',
                height: '600px'
            });
        }
    }, {
        label: '导入对话',
        icon: 'iconGithub',
        submenu: [{
            label: 'Google AI Studio',
            icon: 'iconGithub',
            click: () => {
                persist.importGoogleAIStudio();
            }
        }]
    }]);

    plugin.addCommand({
        langKey: 'open-gpt-chat',
        langText: '打开GPT对话',
        hotkey: translateHotkey('Ctrl+Shift+L'),
        callback: () => {
            openChatTab(true);
        }
    });
    setting.load(plugin);
    clickEvent.register();

    plugin.eventBus.on('open-siyuan-url-plugin', openUrl);

    addSVG(plugin);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    clickEvent.dispose();
    plugin.eventBus.off('open-siyuan-url-plugin', openUrl);
}