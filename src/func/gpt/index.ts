import type FMiscPlugin from "@/index";

import { openCustomTab } from "@frostime/siyuan-plugin-kits";

import { solidDialog } from "@/libs/dialog";
import { render } from "solid-js/web";

import ChatBox from "./components/ChatBox";

export let name = "GPT";
export let enabled = false;
export const declareToggleEnabled = {
    title: '🤖 ChatGPT',
    description: '使用GPT进行对话',
    defaultEnabled: false
};

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.eb.on('on-topbar-menu', (menu) => {
        menu.addItem({
            label: 'TestGPT',
            icon: 'iconEmoji',
            click: () => {
                // solidDialog({
                //     title: 'TestGPT',
                //     loader: () => ChatBox({}),
                //     width: '800px',
                //     height: '600px',
                // })
                openCustomTab({
                    tabId: 'gpt-chat' + new Date().getTime(),
                    render: (container: HTMLElement) => {
                        // container.style.display = 'flex';
                        // container.style.flexDirection = 'column';
                        // container.style.height = '100%';
                        render(() => ChatBox({}), container);
                    },
                    destroyCb: () => {},
                    title: `ChatGPT`,
                    icon: 'iconEmoji',
                })
            }
        });
    });
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
}