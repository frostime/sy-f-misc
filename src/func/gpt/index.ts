import type FMiscPlugin from "@/index";

import { openCustomTab } from "@frostime/siyuan-plugin-kits";

import { solidDialog } from "@/libs/dialog";
import { render } from "solid-js/web";

import ChatBox from "./components/ChatBox";
import { translateHotkey } from "@/libs/hotkey";

export let name = "GPT";
export let enabled = false;
export const declareToggleEnabled = {
    title: '🤖 ChatGPT',
    description: '使用GPT进行对话',
    defaultEnabled: false
};

const openChatBox = () => {
    let { apiModel } = window.siyuan.config.ai.openAI;
    openCustomTab({
        tabId: 'gpt-chat' + new Date().getTime(),
        render: (container: HTMLElement) => {
            // container.style.display = 'flex';
            // container.style.flexDirection = 'column';
            // container.style.height = '100%';
            render(() => ChatBox({}), container);
        },
        destroyCb: () => {},
        title: `和 ${apiModel} 对话`,
        icon: 'iconGithub',
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
    })
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
}