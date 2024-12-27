/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-26 21:02:30
 * @FilePath     : /src/func/webview/app.ts
 * @LastEditTime : 2024-12-26 21:12:57
 * @Description  : 
 */
import { IWebApp } from "./utils/types";

export const CustomApps: IWebApp[] = [
    {
        name: "Mistral",
        iconName: "iconLink",
        iconSvg: "",
        iconSymbolSize: 16,
        title: "Mistral",
        url: "https://chat.mistral.ai/chat",
        debug: false,
        proxy: "",
        referer: "",
        script: "",
        css: `
.group .prose {
    font-family: 'Microsoft YaHei', ui-monospace;
    font-weight: 400;
    font-size: 22px;
}

.items-center>.max-w-screen-md {
    max-width: 1000px;
}

div.prose {
    line-height: 1.5em;
}
`,
        internal: false,
        isTopBar: false,
        topBarPostion: "left",
        openTab: () => { }
    },
    {
        name: "Deepseek",
        iconName: "iconLink",
        iconSvg: "",
        iconSymbolSize: 16,
        title: "Deepseek",
        url: "https://chat.deepseek.com/",
        debug: false,
        proxy: "",
        referer: "",
        script: "",
        css: "",
        internal: false,
        isTopBar: false,
        topBarPostion: "left",
        openTab: () => { }
    }
];