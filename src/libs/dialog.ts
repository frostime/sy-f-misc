/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2025-12-19 19:11:05
 * @Description  : 对话框相关工具
 */

import { simpleDialog } from "@frostime/siyuan-plugin-kits";
import { JSXElement } from "solid-js";
import { render } from "solid-js/web";
import SimpleForm from "./components/simple-form";
import Markdown from "./components/Elements/Markdown";
import { Div } from "./components/solid-component-wrapper";
import { ButtonInput } from "./components/Elements";
import { Dialog, showMessage } from "siyuan";

export const solidDialog = (args: {
    title: string, loader: () => JSXElement,
    width?: string, height?: string,
    maxWidth?: string,
    maxHeight?: string,
    callback?: () => void;
}) => {
    if (args.maxHeight === undefined) {
        args.maxHeight = '90%';
    }
    let container = document.createElement('div')
    container.style.display = 'contents';
    let disposer = render(args.loader, container);
    return simpleDialog({
        ...args, ele: container, callback: () => {
            disposer();
            if (args.callback) args.callback();;
        }
    });
}

export const simpleFormDialog = (options: {
    title: string,
    fields: Parameters<typeof SimpleForm>[0]['fields'],
    onChange?: (key: string, value: any) => void,
    width?: string, height?: string,
    maxWidth?: string,
    maxHeight?: string,
}): Promise<{ ok: boolean, values?: Record<string, any> }> => {
    options.width = options.width || '600px';
    options.maxHeight = options.maxHeight || '80vh';
    return new Promise((resolve) => {
        const iniValues = options.fields.reduce((acc, field) => {
            acc[field.key] = field.value;
            return acc;
        }, {} as Record<string, any>);
        let formValues = { ...iniValues };

        const { close } = solidDialog({
            title: options.title,
            loader: () => {
                return SimpleForm({
                    fields: options.fields,
                    onChange: (key, value) => {
                        options.onChange?.(key, value);
                    },
                    onSave: (values) => {
                        Object.assign(formValues, values);
                        close();
                        // resolve(formValues);
                        resolve({ ok: true, values: formValues });
                    },
                    onCancel: () => {
                        close();
                        // resolve(null);
                        resolve({ ok: false });
                    },
                    styles: {
                        flex: '1',
                        padding: '10px 20px'
                    }
                });
            },
            width: options.width,
            height: options.height,
            maxWidth: options.maxWidth,
            maxHeight: options.maxHeight,
        });
    });
}


export const selectIconDialog = (callback?: (icon: string) => void) => {
    const symbols = document.querySelectorAll('symbol');
    const html = `
    <div class="icons" style="margin: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));">
        ${Array.from(symbols).map(symbol => {
        return `<svg style="width: 20px; height: 20px; padding: 5px; cursor: pointer;" title="${symbol.id}"><use xlink:href="#${symbol.id}"></use></svg>`
    }).join('\n')}
    </div>
    `;
    const dialog = new Dialog({
        title: '选择图标',
        content: html,
        width: '500px',
        height: '400px',
    });
    dialog.element.querySelector('.icons').addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('svg');
        if (!target) return;

        const icon = target.querySelector('use').getAttribute('xlink:href').replace('#', '');
        if (callback) {
            callback(icon);
            dialog.destroy();
        } else {
            navigator.clipboard.writeText(icon).then(() => {
                showMessage(`复制到剪贴板: ${icon}`, 2000);
            });
        }
    });
}


export const documentDialog = async (args: {
    markdown?: string;
    sourceUrl?: string;
    title?: string;
    dialogOptions?: Partial<Parameters<typeof simpleDialog>[0]>;
}) => {

    let markdown = args.markdown;
    if (!markdown && args.sourceUrl) {
        try {
            const DOC_ENDPOINT = '/plugins/sy-f-misc/docs'
            let url = args.sourceUrl;
            url = url.replace('{{docs}}', DOC_ENDPOINT);
            const resp = await fetch(url);
            if (resp.ok) {
                markdown = await resp.text();
            } else {
                markdown = `无法加载文档，HTTP 状态码：${resp.status}`;
            }
        } catch (error) {
            markdown = `无法加载文档，错误信息：${(error as Error).message}`;
        }
    }

    solidDialog({
        title: args.title || '文档',
        loader: () => {
            return Div({
                style: {
                    background: 'var(--b3-theme-background)',
                    'font-size': '18px',
                    'padding': '12px 16px',
                    width: '100%',
                    display: 'flex',
                    "justify-content": 'center',
                    position: 'relative',
                },
                // children: Markdown({ markdown: markdown || '', fontSize: '18px' })
                children: [
                    Markdown({ markdown: markdown || '', fontSize: '18px' }),
                    ButtonInput({
                        label: '复制',
                        style: {
                            position: 'absolute',
                            top: '12px',
                            right: '16px',
                        },
                        onClick: () => {
                            navigator.clipboard.writeText(markdown || '');
                            showMessage('文档内容已复制到剪贴板');
                        }
                    })
                ]
            })
        },
        width: '840px',
        maxWidth: '1200px',
        maxHeight: '75vh',
        ...args.dialogOptions,
    });
}