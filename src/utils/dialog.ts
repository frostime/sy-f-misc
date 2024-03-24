/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/utils/dialog.ts
 * @LastEditTime : 2024-03-23 21:39:42
 * @Description  : 对话框相关工具
 */
import { Dialog } from "siyuan";

export const inputDialog = (
    title: string, placeholder: string = '', defaultText: string = '',
    confirm?: (text: string) => void, cancel?: () => void
) => {
    const dialog = new Dialog({
        title,
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword"><textarea class="b3-text-field fn__block" style="height: 100%;" placeholder=${placeholder}>${defaultText}</textarea></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
        width: "520px",
    });
    const target: HTMLTextAreaElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword>textarea");
    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", () => {
        if (cancel) {
            cancel();
        }
        dialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
        if (confirm) {
            confirm(target.value);
        }
        dialog.destroy();
    });
};
