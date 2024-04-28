/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-20 00:45:45
 * @FilePath     : /src/func/test-template.ts
 * @LastEditTime : 2024-04-28 20:14:16
 * @Description  : 
 */
import { Dialog, Menu } from "siyuan";

// import { enableTabToIndent } from "@/libs/indent-textarea";
import * as api from "@/api";
import type FMiscPlugin from "@/index";

// 找到 .action{ .*? } ，转换成 {{ .*? }}
const toSprig = (template: string) => {
    // return template.replace(/\.action{\s*(.*?)\s*}/g, '{{ $1 }}');
    return template.replace(/\.action{\s*(.*?)\s*}/g, (_, p1) => {
        if (p1.startsWith('/*') && p1.endsWith('*/')) {
            return `{{${p1}}}`;
        } else {
            return `{{ ${p1} }}`;
        }
    });
}

// 找到 {{ .*? }} ，转换成 .action{ .*? }
// 如果是 {{/*...*/}}，则两边不要添加空格
const toAction = (template: string) => {
    // return template.replace(/{{\s*(.*?)\s*}}/g, '.action{ $1 }');
    return template.replace(/{{\s*(.*?)\s*}}/g, (_, p1) => {
        if (p1.startsWith('/*') && p1.endsWith('*/')) {
            return `.action{${p1}}`;
        } else {
            return `.action{ ${p1} }`;
        }
    });
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

function preprocessTemplateRegion(template: string): string {
    // Regular expression to find text between .startaction and .endaction
    const pattern = /\.startaction(.*?)\.endaction/gs;

    // Replace the matched groups
    return template.replace(pattern, (_, group1: string) => {
        // Split the group into lines and transform each line
        const lines = group1.split('\n').filter(line => line.trim() !== '');
        const transformedLines = lines.map(line => `.action{ ${line.trim()} }`);
        return transformedLines.join('\n');
    });
}

// let templateText = '';

//UI, 上面一行按钮，「转换」，「渲染」，下面并列两个框，左边是原始文本，右边是转换后的文本
const uiTemplate = `
<section style="display: flex; flex-direction: column; flex: 1; padding: 25px;">
  <div style="display: flex; justify-content: flex-start; margin-bottom: 10px; gap: 10px;">
    <button id="insertregion" class="b3-button" >Insert Region</button>
    <button id="translateregion" class="b3-button" >Translate Region</button>
    <span style="display: inline; width: 1px; background-color: var(--b3-border-color);"></span>
    <button id="remove-sprig" class="b3-button" >Remove {{ }}</button>
    <button id="remove-action" class="b3-button" >Remove .action{ }</button>
    <span style="display: inline; width: 1px; background-color: var(--b3-border-color);"></span>
    <button id="tosprig" class="b3-button" >To {{ }}</button>
    <button id="toaction" class="b3-button" >To .action{ }</button>
    <span class="fn__flex-1"></span>
    <button id="render" class="b3-button">Render</button>
  </div>
  <div style="display: flex; flex: 1; gap: 10px;">
    <textarea class="b3-text-field fn__block" id="original" placeholder="Template" style="flex: 1;font-family: var(--b3-font-family-code); resize: none; font-size: 20px; line-height: 25px;" spellcheck="false"></textarea>
    <textarea class="b3-text-field fn__block" id="converted" placeholder="Rendered" style="flex: 1; font-family: var(--b3-font-family-code); resize: none; font-size: 20px; line-height: 25px;" spellcheck="false"></textarea>
  </div>
</section>
`;
const template = document.createElement('template');
template.innerHTML = uiTemplate;

let templateText = '';

const createElement = () => {
    const element = template.content.cloneNode(true) as HTMLElement;
    const original = element.querySelector('#original') as HTMLTextAreaElement;
    const converted = element.querySelector('#converted') as HTMLTextAreaElement;
    original.value = templateText;

    original.addEventListener('input', () => {
        templateText = original.value;
    });

    element.querySelector('#insertregion').addEventListener('click', () => {
        original.value = original.value + '.startaction\n\n.endaction';
        //set cursor
        original.focus();
        original.selectionStart = original.value.length - 11;
        original.selectionEnd = original.value.length - 11;
    })
    element.querySelector('#remove-sprig').addEventListener('click', () => {
        original.value = original.value.replace(/{{\s*(.*?)\s*}}/g, '$1');
    });
    element.querySelector('#remove-action').addEventListener('click', () => {
        original.value = original.value.replace(/\.action{\s*(.*?)\s*}/g, '$1');
    });
    element.querySelector('#translateregion').addEventListener('click', () => {
        original.value = preprocessTemplateRegion(original.value);
    })
    element.querySelector('#tosprig').addEventListener('click', () => {
        original.value = toSprig(original.value);
    });
    element.querySelector('#toaction').addEventListener('click', () => {
        original.value = toAction(original.value);
    });
    element.querySelector('#render').addEventListener('click', async () => {
        let template = toSprig(preprocessTemplateRegion(original.value))
        converted.value = await render(template);
    });
    return element;
}


const addMenu = (menu: Menu) => {
    menu.addItem({
        label: '测试模板',
        icon: 'iconMarkdown',
        click: () => {
            let dialog = new Dialog({
                title: 'Test Template',
                content: '<div id="test-template" style="display: flex; flex: 1;"></div>',
                width: "80%",
                height: "80%"
            });
            let ele = createElement();
            dialog.element.querySelector('#test-template').appendChild(ele);
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
