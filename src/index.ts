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

    addProtyleSlash(slash) {
        for (let i = 0; i < this.protyleSlash.length; i++) {
            if (this.protyleSlash[i].id === slash.id) {
                return;
            }
        }
        this.protyleSlash.push(slash);
    }

    delProtyleSlash(id) {
        this.protyleSlash = this.protyleSlash.filter(slash => slash.id !== id);
    }
}
