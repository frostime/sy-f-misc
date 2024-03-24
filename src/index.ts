import {
    Plugin,
    getFrontend
} from "siyuan";


import { load } from "./func";

import "@/index.scss";


// import { SettingUtils } from "./libs/setting-utils";

export default class PluginSample extends Plugin {

    isMobile: boolean;
    // private settingUtils: SettingUtils;

    async onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        load(this);
    }


}
