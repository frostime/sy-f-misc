/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/index.ts
 * @LastEditTime : 2024-03-25 14:05:44
 * @Description  : 
 */
import {
    Plugin,
    getFrontend
} from "siyuan";


import { load, unload } from "./func";

import "@/index.scss";


// import { SettingUtils } from "./libs/setting-utils";

export default class FMiscPlugin extends Plugin {

    isMobile: boolean;
    // private settingUtils: SettingUtils;

    async onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        load(this);
    }

    async onunload() {
        unload(this);
    }

    addProtyleSlash(slash: IPluginProtyleSlash) {
        for (let i = 0; i < this.protyleSlash.length; i++) {
            if (this.protyleSlash[i].id === slash.id) {
                return;
            }
        }
        this.protyleSlash.push(slash);
    }

    delProtyleSlash(id: BlockId) {
        this.protyleSlash = this.protyleSlash.filter(slash => slash.id !== id);
    }
}
