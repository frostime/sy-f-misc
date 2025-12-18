/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2025-12-19 00:49:18
 * @Description  : 对话框相关工具
 */

import { getLute, html2ele, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { JSXElement } from "solid-js";
import { render } from "solid-js/web";
import SimpleForm from "./components/simple-form";
import { showMessage } from "siyuan";

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


export const documentDialog = async (args: {
    markdown?: string;
    sourceUrl?: string;
    title?: string;
    dialogOptions?: Partial<Parameters<typeof simpleDialog>[0]>;
}) => {
    let markdown = args.markdown;
    if (!markdown && args.sourceUrl) {
        try {
            const resp = await fetch(args.sourceUrl);
            if (resp.ok) {
                markdown = await resp.text();
            } else {
                markdown = `无法加载文档，HTTP 状态码：${resp.status}`;
            }
        } catch (error) {
            markdown = `无法加载文档，错误信息：${(error as Error).message}`;
        }
    }

    const lute = getLute();
    // @ts-ignore
    const docHtml = lute.Md2HTML(args.markdown);
    const html = `
            <div style="width: 100%; padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px;">
                <div style="display: inline-flex; gap: 8px; align-items: center; justify-content: flex-end;">
                    <button class="b3-button b3-button--outline" data-action="copy-prompt">
                        复制
                    </button>
                </div>
                <div class="item__readme b3-typography">
                    ${docHtml}
                </div>
            </div>
        `;
    const ele = html2ele(html) as HTMLElement;
    ele.querySelector('button').onclick = () => {
        navigator.clipboard.writeText(args.markdown);
        showMessage('文档内容已复制到剪贴板');
    };
    simpleDialog({
        title: args.title || '文档',
        ele,
        width: '960px',
        maxHeight: '75vh',
        ...args.dialogOptions,
    });
}