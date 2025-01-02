/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 23:36:06
 * @FilePath     : /src/func/toggl/components/index.ts
 * @LastEditTime : 2025-01-02 13:43:05
 * @Description  : 
 */
// import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { config as configRef } from "../state/config";
import { TimerBubble } from "./timer-bubble";
import { showTogglDialog } from "./dialog";
import { render } from "solid-js/web";
// import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { TimerStatusBar } from "./timer-status-bar";

const InMiniWindow = () => {
    const body: HTMLElement = document.querySelector('body');
    return body.classList.contains('body--window');
}

const config = configRef.store;

let disposeMiniTimer: () => void;
export const updateMiniTimerUI = () => {
    // const plugin = thisPlugin();
    disposeMiniTimer?.();
    disposeMiniTimer = undefined;
    if (config.miniTimerType === 'none') {
        return;
    }
    if (config.miniTimerType === 'statusBar') {
        const statusBarElement = document.createElement('div');
        statusBarElement.className = 'toolbar__item ariaLabel';
        let dispose = render(() => (
            // <TogglStatusBar onClick={() => showTogglDialog()} />
            TimerStatusBar({
                onClick: () => showTogglDialog()
            })
        ), statusBarElement);

        let dock = document.querySelector('#barDock')
        dock?.insertAdjacentElement('afterend', statusBarElement);
        disposeMiniTimer = () => {
            dispose?.();
            dispose = undefined;
            statusBarElement.remove();
        };
    } else if (config.miniTimerType === 'bubble') {
        if (InMiniWindow()) {
            return;
        }
        const container = document.createElement('div');
        document.body.appendChild(container);

        // 渲染悬浮气泡
        const StatusBarComponent = () => TimerBubble({ onClick: showTogglDialog });
        let dispose = render(StatusBarComponent, container);
        disposeMiniTimer = () => {
            dispose();
            dispose = undefined;
            container.remove();
        };
    }
}

export const load = () => {
    updateMiniTimerUI();
};


export const unload = () => {
    disposeMiniTimer?.();
    disposeMiniTimer = undefined;
};
