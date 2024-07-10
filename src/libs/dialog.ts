/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2024-07-10 14:18:32
 * @Description  : 对话框相关工具
 */
import { Dialog } from "siyuan";
import { JSXElement } from "solid-js";
import { render } from "solid-js/web";

export const simpleDialog = (args: {
    title: string, ele: HTMLElement | DocumentFragment,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    const dialog = new Dialog({
        title: args.title,
        content: `<div class="fn__flex fn__flex dialog-content"/>`,
        width: args.width,
        height: args.height,
        destroyCallback: args.callback
    });
    dialog.element.querySelector(".dialog-content").appendChild(args.ele);
    return dialog;
}

export const solidDialog = (args: {
    title: string, loader: () => JSXElement,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    const dialog = new Dialog({
        title: args.title,
        content: `<div class="dialog-content" style="display: contents;"/>`,
        width: args.width,
        height: args.height,
        destroyCallback: args.callback
    });
    let ele = dialog.element.querySelector(".dialog-content");
    render(args.loader, ele);
    return dialog;
}


interface IConfirmDialogArgs {
    title: string;
    content: string | HTMLElement;
    confirm?: (ele?: HTMLElement) => void;
    cancel?: (ele?: HTMLElement) => void;
    width?: string;
    height?: string;
}

export const confirmDialog = (args: IConfirmDialogArgs) => {
    const { title, content, confirm, cancel, width, height } = args;

    const dialog = new Dialog({
        title,
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
        width: width,
        height: height
    });

    const target: HTMLElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword");
    if (typeof content === "string") {
        target.innerHTML = content;
    } else {
        target.appendChild(content);
    }

    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", () => {
        if (cancel) {
            cancel(target);
        }
        dialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
        if (confirm) {
            confirm(target);
        }
        dialog.destroy();
    });
    return dialog;
};


export const confirmDialogSync = async (args: IConfirmDialogArgs) => {
    return new Promise<HTMLElement>((resolve) => {
        let newargs = {
            ...args, confirm: (ele: HTMLElement) => {
                resolve(ele);
            }, cancel: (ele: HTMLElement) => {
                resolve(ele);
            }
        };
        confirmDialog(newargs);
    });
};
