import {
    Plugin,
    getFrontend,
    Protyle,
    showMessage
} from "siyuan";
import { inputDialog } from "./utils/dialog";

import { addNewEmptyFile } from "./func";

import "@/index.scss";


// import { SettingUtils } from "./libs/setting-utils";

export default class PluginSample extends Plugin {

    isMobile: boolean;
    // private settingUtils: SettingUtils;

    async onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        this.initProtyleSlash();
    }

    initProtyleSlash() {
        this.protyleSlash = [
            {
                filter: ['ni', '新建', 'new'],
                html: '新建空白附件',
                id: 'new-file',
                callback: async (protyle: Protyle) => {
                    inputDialog('新建空白附件', '输入文件名称', '', async (fname: string) => {
                        let succMap = await addNewEmptyFile(fname);
                        let filePath = succMap?.[fname];
                        if (filePath) {
                            showMessage(`新建文件${fname}成功, 文件路径: ${filePath}`);
                            protyle.insert(`<span data-type="a" data-href="${filePath}">${fname}</span>`, false, true);
                        } else {
                            showMessage(`新建文件${fname}失败`);
                            protyle.insert(``, false);
                        }
                    });
                }
            }
        ];
    }

}
