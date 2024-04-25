/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-20 00:45:45
 * @FilePath     : /src/func/test-template.ts
 * @LastEditTime : 2024-04-25 12:10:19
 * @Description  : 
 */
import { Dialog, Menu } from "siyuan";

import type FMiscPlugin from "@/index";
import * as api from "@/api";

// 找到 .action{ .*? } ，转换成 {{ .*? }}
const toSprig = (template: string) => {
    return template.replace(/\.action{\s*(.*?)\s*}/g, '{{ $1 }}');
}

// 找到 {{ .*? }} ，转换成 .action{ .*? }
const toAction = (template: string) => {
    return template.replace(/{{\s*(.*?)\s*}}/g, '.action{ $1 }');
}

const render = async (sprig: string) => {
    let res = '';
    try {
        res = await api.renderSprig(sprig);
    } catch (e) {
        res = e.toString();
    }
    return res;
}

function processSprigText(inputText: string): string {
    // Regular expression to find text between .startaction and .endaction
    const pattern = /\.startaction(.*?)\.endaction/gs;

    // Replace the matched groups
    return inputText.replace(pattern, (match, group1) => {
        // Split the group into lines and transform each line
        const lines = group1.split('\n').filter(line => line.trim() !== '');
        const transformedLines = lines.map(line => `.action{ ${line.trim()} }`);
        return transformedLines.join('\n');
    });
}

//UI, 上面一行按钮，「转换」，「渲染」，下面并列两个框，左边是原始文本，右边是转换后的文本
const uiTemplate = `
<section style="display: flex; flex-direction: column; flex: 1; margin: 15px;">
  <div style="display: flex; justify-content: flex-start; margin-bottom: 10px;">
    <button id="actionregion" class="b3-button" style="margin-right: 10px;">.region</button>
    <button id="tosprig" class="b3-button" style="margin-right: 10px;">{{ }}</button>
    <button id="toaction" class="b3-button" style="margin-right: 10px;">.action{ }</button>
    <button id="render" class="b3-button">Render</button>
  </div>
  <div style="display: flex; flex: 1; gap: 10px;">
    <textarea class="b3-text-field fn__block" id="original" placeholder="Template" style="flex: 3;font-family: var(--b3-font-family-code); resize: none; font-size: 1.1rem;"></textarea>
    <textarea class="b3-text-field fn__block" id="converted" placeholder="Rendered" style="flex: 2; font-family: var(--b3-font-family-code); resize: none; font-size: 1.1rem;"></textarea>
  </div>
</section>
`;

const addMenu = (menu: Menu) => {
    menu.addItem({
        label: '测试模板',
        icon: 'iconMarkdown',
        click: () => {
            let dialog = new Dialog({
                title: '测试模板',
                content: uiTemplate,
                width: "80%",
                height: "80%"
            });
            dialog.element.querySelector('#actionregion').addEventListener('click', () => {
                let original = dialog.element.querySelector('#original') as HTMLTextAreaElement;
                original.value = processSprigText(original.value);
            })
            dialog.element.querySelector('#tosprig').addEventListener('click', () => {
                let original = dialog.element.querySelector('#original') as HTMLTextAreaElement;
                original.value = toSprig(original.value);
            });
            dialog.element.querySelector('#toaction').addEventListener('click', () => {
                let original = dialog.element.querySelector('#original') as HTMLTextAreaElement;
                original.value = toAction(original.value);
            });
            dialog.element.querySelector('#render').addEventListener('click', async () => {
                let converted = dialog.element.querySelector('#converted') as HTMLTextAreaElement;
                let original = dialog.element.querySelector('#original') as HTMLTextAreaElement;
                converted.value = await render(toSprig(original.value));
            });
        }
    });
}

export let name = "TestTemplate";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    plugin.eb.on('on-topbar-menu', addMenu);
    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    plugin.eb.off('on-topbar-menu', addMenu);
    enabled = false;
}
