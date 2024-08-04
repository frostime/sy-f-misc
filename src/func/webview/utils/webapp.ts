import { IWebApp } from "./types";

/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-04 16:31:27
 * @FilePath     : /src/func/webview/utils/webapp.ts
 * @LastEditTime : 2024-08-04 16:36:25
 * @Description  : 
 */
export function registerIcon(name: string, size: number, svg: string) {
    document.body.insertAdjacentHTML(
        "beforeend",
        `<svg style="position: absolute; width: 0; height: 0; overflow: hidden;" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <symbol id="${name}" viewBox="0 0 ${size} ${size}">
                ${svg}
            </symbol>
        </defs>
    </svg>`
    );
}

class WebApp implements IWebApp {
    name = "";
    iconName = "";
    iconSvg = "";
    iconSymbolSize = 1024;
    title = "";
    isTopBar = false;
    topBarPostion: "left" | "right" = "right";
    script = "";
    css = "";
    proxy = '';
    url = "";
    debug = false;
    internal = false;
    referer = '';
    openTab: () => void = null;

    constructor(options) {
        this.name = options.name || "";
        this.iconName = options.iconName || "";
        this.iconSvg = options.iconSvg || "";
        this.iconSymbolSize = options.iconSymbolSize || 1024;
        this.title = options.title || "";
        this.isTopBar = options.isTopBar || false;
        this.topBarPostion = options.topBarPostion || "right";
        this.url = options.url || "";
        this.script = options.script || "";
        this.css = options.css || "";
        this.debug = options.debug || false;
        this.proxy = options.proxy || '';
        this.referer = options.referer || '';
        this.loadIcon();
    }

    loadIcon() {
        if (!this.iconSvg || !this.iconName || !this.iconSymbolSize || this.iconName === 'iconHTML5') {
            return;
        }
        registerIcon(this.iconName, this.iconSymbolSize, this.iconSvg);
    }
}


const webapp = (options: {
    url: string,
    name?: string,
    title?: string,
    iconName?: string,
    iconSvg?: string,
    iconSymbolSize?: number,
    isTopBar?: boolean,
    topBarPostion?: string,
    script?: string,
    css?: string,
    debug?: boolean,
    proxy?: string,
    referer?: string,
    openTab?: () => void
}) => {
    return new WebApp(options);
};

export default webapp;
