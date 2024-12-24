/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-19 21:52:17
 * @FilePath     : /src/func/gpt/index.ts
 * @LastEditTime : 2024-12-24 23:42:32
 * @Description  : 
 */
import type FMiscPlugin from "@/index";

import { openCustomTab } from "@frostime/siyuan-plugin-kits";

import { render } from "solid-js/web";

import ChatSession from "./components/ChatSession";
import { translateHotkey } from "@/libs/hotkey";
import * as setting from "./setting";
import { ISignalRef, useSignalRef } from "@frostime/solid-signal-ref";
import { id2block } from "./utils";

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

        return `\n\n<Context>\n${selectedText}\n</Context>`;
    }

    let blocksIds = [];
    nodes.forEach((node: HTMLElement) => {
        blocksIds.push(node.dataset.nodeId);
    });
    let blocks: Block[] = await id2block(...blocksIds);
    let blocksMap = new Map(blocks.map(block => [block.id, block]));
    let sortedBlocks = blocksIds.map(id => blocksMap.get(id));
    let blockMarkdown = sortedBlocks.map((block) => block.markdown);
    return `\n\n<Context lang="markdown">\n${blockMarkdown.join('\n').trim()}\n\n</Context>`
}

let activeTabId = null;

/**
 * 外部传递给 Chat Session 的信号
 */
const outsideInputs = {}

const openChatTab = async () => {

    const prompt = await attachSelectedText();
    //input 用于在从外部给内部 Chat 添加文本内容
    let input: ISignalRef<string>;
    if (activeTabId === null) {
        activeTabId = 'gpt-chat' + new Date().getTime();
        input = useSignalRef(prompt);
        outsideInputs[activeTabId] = input;
    } else {
        input = outsideInputs[activeTabId];
        input.value = prompt;
    }
    let disposer = () => { };
    openCustomTab({
        tabId: activeTabId,
        render: (container: HTMLElement) => {
            disposer = render(() => ChatSession({
                input: input
            }), container);
            let tabContainer: HTMLElement = container.closest('[data-id]');
            if (tabContainer) {
                tabContainer.style.overflowY = 'clip';
                tabContainer.style.background = 'var(--chat-bg-color)';
            }
        },
        beforeDestroy: () => {
            activeTabId = null;
            delete outsideInputs[activeTabId];
            disposer(); //调用 solidjs 的 onCleanup
        },
        title: '和 GPT 对话',
        icon: 'iconGithub',
        position: prompt.trim() ? 'right' : undefined
    });
}


// TODO: 点击导出的文档，从存储的 json 中恢复对话

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.eb.on('on-topbar-menu', (menu) => {
        menu.addItem({
            label: '和 GPT 对话',
            icon: 'iconGithub',
            click: () => {
                openChatTab();
            }
        });
    });

    plugin.addCommand({
        langKey: 'open-gpt-chat',
        langText: '打开GPT对话',
        hotkey: translateHotkey('Ctrl+Shift+L'),
        callback: () => {
            openChatTab();
        }
    });
    setting.load(plugin);
}

export const unload = () => {
    if (!enabled) return;
    enabled = false;
}