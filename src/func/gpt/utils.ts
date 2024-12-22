/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-22 10:26:12
 * @FilePath     : /src/func/gpt/utils.ts
 * @LastEditTime : 2024-12-22 10:44:49
 * @Description  : 
 */
//https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/util/addScript.ts
export const addScript = (path: string, id: string) => {
    return new Promise((resolve) => {
        if (document.getElementById(id)) {
            // 脚本加载后再次调用直接返回
            resolve(false);
            return false;
        }
        const scriptElement = document.createElement("script");
        scriptElement.src = path;
        scriptElement.async = true;
        // 循环调用时 Chrome 不会重复请求 js
        document.head.appendChild(scriptElement);
        scriptElement.onload = () => {
            if (document.getElementById(id)) {
                // 循环调用需清除 DOM 中的 script 标签
                scriptElement.remove();
                resolve(false);
                return false;
            }
            scriptElement.id = id;
            resolve(true);
        };
    });
};


// https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/util/addStyle.ts
export const addStyle = (url: string, id: string) => {
    if (!document.getElementById(id)) {
        const styleElement = document.createElement("link");
        styleElement.id = id;
        styleElement.rel = "stylesheet";
        styleElement.type = "text/css";
        styleElement.href = url;
        const pluginsStyle = document.querySelector("#pluginsStyle");
        if (pluginsStyle) {
            pluginsStyle.before(styleElement);
        } else {
            document.getElementsByTagName("head")[0].appendChild(styleElement);
        }
    }
};
