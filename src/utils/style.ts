/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-02 22:37:42
 * @FilePath     : /src/utils/style.ts
 * @LastEditTime : 2024-04-04 16:12:50
 * @Description  : 
 */
/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-02 22:37:42
 * @FilePath     : /src/utils/style.ts
 * @LastEditTime : 2024-04-04 16:03:30
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

export const removeDomById = (id: string) => {
    const link = document.getElementById(id) as HTMLLinkElement
    if (link) {
        link.remove();
    }
}
