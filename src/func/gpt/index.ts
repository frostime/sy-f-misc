/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-19 21:52:17
 * @FilePath     : /src/func/gpt/index.ts
 * @LastEditTime : 2024-12-21 15:27:37
 * @Description  : 
 */
import { Lute } from "siyuan";
import type FMiscPlugin from "@/index";

import { openCustomTab } from "@frostime/siyuan-plugin-kits";

// import { solidDialog } from "@/libs/dialog";
import { render } from "solid-js/web";

import ChatSession from "./components/ChatSession";
import { translateHotkey } from "@/libs/hotkey";
import * as setting from "./setting";
import { getLute } from "@frostime/siyuan-plugin-kits";

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
        element: setting.ChatSessionDefaultSetting
    }
]

const attachSelectedText = () => {
    // 获取光标所在位置
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return '';
    }

    // 获取对应的 element
    const range = selection.getRangeAt(0);
    const element = range.startContainer.parentElement.closest('.protyle-wysiwyg');

    let nodes = element.querySelectorAll('.protyle-wysiwyg--select');
    if (nodes.length === 0) {
        return '';
    }

    let lute = getLute();
    let blockMarkdown = [];
    nodes.forEach((node: HTMLElement) => {
        let markdown = lute.BlockDOM2StdMd(node.outerHTML);
        blockMarkdown.push(markdown);
    });
    return `\n\n<Context lang="markdown">\n${blockMarkdown.join('\n')}\n</Context>`
}

const openChatBox = () => {
    let { apiModel } = window.siyuan.config.ai.openAI;

    const prompt = attachSelectedText();

    openCustomTab({
        tabId: 'gpt-chat' + new Date().getTime(),
        render: (container: HTMLElement) => {
            render(() => ChatSession({prompt: prompt}), container);
            let tabContainer: HTMLElement = container.closest('[data-id]');
            if (tabContainer) {
                tabContainer.style.overflowY = 'clip';
            }
        },
        destroyCb: () => {},
        title: `和 ${apiModel} 对话`,
        icon: 'iconGithub',
        position: prompt.trim() ? 'right' : undefined
    });
}

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.eb.on('on-topbar-menu', (menu) => {
        menu.addItem({
            label: '和 GPT 对话',
            icon: 'iconGithub',
            click: () => {
                openChatBox();
            }
        });
    });

    plugin.addCommand({
        langKey: 'open-gpt-chat',
        langText: '打开GPT对话',
        hotkey: translateHotkey('Ctrl+Shift+L'),
        callback: () => {
            openChatBox();
        }
    });
    setting.load(plugin);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
}