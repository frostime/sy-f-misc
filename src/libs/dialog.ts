/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2025-12-17 15:07:02
 * @Description  : 对话框相关工具
 */

import { simpleDialog } from "@frostime/siyuan-plugin-kits";
import { JSXElement } from "solid-js";
import { render } from "solid-js/web";
import SimpleForm from "./components/simple-form";

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