/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-02 22:37:42
 * @FilePath     : /src/utils/style.ts
 * @LastEditTime : 2024-04-18 18:38:34
 * @Description  : 
 */
export const loadStyleLink = (id: string, href: string) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = href;
    link.id = id;
    document.head.appendChild(link);
}

export const updateStyleLink = (id: string, href: string) => {
    const link = document.getElementById(id) as HTMLLinkElement
    if (!link) {
        loadStyleLink(id, href);
        return;
    }
    link.setAttribute('href', href);
}

export const insertStyle = (id: string, css: string) => {
    let ele = document.getElementById(id);
    if (ele) {
        ele.innerHTML = css;
        return;
    }
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = css;
    document.head.appendChild(style);
}

export const removeStyle = (id: string) => {
    const style = document.getElementById(id) as HTMLStyleElement
    if (style && style.tagName === 'STYLE') {
        style.remove();
    }
}

export const removeDomById = (id: string) => {
    const link = document.getElementById(id) as HTMLLinkElement
    if (link) {
        link.remove();
    }
}
