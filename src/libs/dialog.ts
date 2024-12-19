/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2024-12-19 14:42:42
 * @Description  : 对话框相关工具
 */

import { simpleDialog } from "@frostime/siyuan-plugin-kits";
import { JSXElement } from "solid-js";
import { render } from "solid-js/web";

export const solidDialog = (args: {
    title: string, loader: () => JSXElement,
    width?: string, height?: string,
    maxHeight?: string,
    callback?: () => void;
}) => {
    let container = document.createElement('div')
    container.style.display = 'contents';
    let disposer = render(args.loader, container);
    return simpleDialog({...args, ele: container, callback: () => {
        disposer();
        if (args.callback) args.callback();;
    }});
}
