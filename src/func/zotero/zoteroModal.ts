// import Fuse from "fuse.js";

import {
    Protyle,
    showMessage
} from "siyuan";

import * as api from '@/api';
import type FMiscPlugin from "@/index";


// function processKey(key: string): [number, string] {
//     if (!key) return [1, key];
//     const group = key.split("_");
//     if (group.length <= 1 || isNaN(+group[0])) {
//         // 整个长度小于等于1（不含“_”或者为空）或者第一个字符不是数字的，都视为非新生成的
//         return [1, key];
//     } else {
//         return [eval(group[0]), group.slice(1).join("_")];
//     }
// }

interface ISelectedItem {
    key: string,
    title: string,
    publicationTitle: string
    itemType: string,
    date: string,
    url: string,
    DOI: string,
    volume: string,
}

export class ZoteroDBModal {
    private absZoteroJSPath: string;
    public plugin: FMiscPlugin;
    public protyle: Protyle;

    logger = {
        info: (msg: string, data?: any) => console.log(msg, data),
        error: (msg: string, data?: any) => console.error(msg, data)
    };

    constructor(plugin: FMiscPlugin) {
        this.plugin = plugin;
        this.absZoteroJSPath = `/data/plugins/${plugin.name}/zoteroJS/`;
    }

    public async getSelectedItems(): Promise<ISelectedItem[]> {
        let isRunning = await this.checkZoteroRunning();
        if (isRunning) {
            return await this._getSelectedItems();
        } else {
            showMessage("无法连接到 Zotero", 5000, 'error');
            return null;
        }
    }

    private async _getSelectedItems() {
        return await this._callZoteroJS("getSelectedItems", "");
    }

    private async checkZoteroRunning(): Promise<boolean> {
        let data = (await this._callZoteroJS("checkRunning", ""));
        return data?.ready;
    }

    /** 这部分先不用
    private async checkItemKeyExist(libraryID: number, itemKey: string): Promise<boolean> {
        if (!itemKey.length) return false;
        return (await this._callZoteroJS("checkItemKeyExist", `
      var key = "${itemKey}";
      var libraryID = ${libraryID};
    `)).itemKeyExist;
    }

    private async getAllItems(): Promise<SearchItem[]> {
        return await this._callZoteroJS("getAllItems", "");
    }

    private async getItemByItemKey(libraryID: number, itemKey: string) {
        return await this._callZoteroJS("getItemByItemKey", `
      var key = "${itemKey}";
      var libraryID = ${libraryID};
    `);
    }

    private async getItemKeyByCitekey(libraryID: number, citekey: string) {
        return (await this._callZoteroJS("getItemKeyByCiteKey", `
      var citekey = "${citekey}";
      var libraryID = ${libraryID};
    `)).itemKey;
    }

    private async getNotesByItemKey(libraryID: number, itemKey: string) {
        return await this._callZoteroJS("getNotesByItemKey", `
      var key = "${itemKey}";
      var libraryID = ${libraryID};
    `);
    }

    private async _updateURLToItem(libraryID: number, itemKey: string, title: string, url: string) {
        return await this._callZoteroJS("updateURLToItem", `
      var key = "${itemKey}";
      var libraryID = ${libraryID};
      var url = "${url}";
      var title = "${title}";
    `);
    }
    */

    private async _callZoteroJS(filename: string, prefix: string) {
        // const password = this.plugin.data[STORAGE_NAME].dbPassword;
        const password = this.plugin.getConfig("Misc", "zoteroPassword");
        const jsContent = await api.getFile(this.absZoteroJSPath + filename + ".js", "text");

        const headers = new Headers();
        headers.append("Content-Type", "application/javascript");
        headers.append("Accept", "application/json");
        headers.append("Zotero-Allowed-Request", "true");
        headers.append("Authorization", `Bearer ${password}`);
        const raw = prefix + "\n" + jsContent;
        const requestOptions = {
            method: "POST",
            headers: headers,
            body: raw
        };

        try {
            let response = await fetch(
                `http://127.0.0.1:23119/debug-bridge/execute?password=${password}`, requestOptions
            );
            const data = await response.json();
            return data;
        } catch (e) {
            console.warn('远程链接 Zotero 失败');
            console.warn(e);
            // if (e.response?.status == 401) this.plugin.noticer.error(this.plugin.i18n.errors.wrongDBPassword); // 密码错误
            // else if (e.response?.status == 403) this.plugin.noticer.error((this.plugin.i18n.errors.zoteroNotRunning as string), { type: this.type }); // 访问请求被禁止，建议更新到最新版本citation插件
            // else if (e.response?.status == 404) this.plugin.noticer.error((this.plugin.i18n.errors.zoteroNotRunning as string), { type: this.type }); //找不到Zotero或者debug-bridge
            // else if (e.response?.status == 0) this.plugin.noticer.error((this.plugin.i18n.errors.zoteroNotRunning as string), { type: this.type }); //无法与Zotero通信，没安装Unblock浏览器插件
            // return {
            //     data: JSON.stringify({
            //         ready: false
            //     })
            // };
        }
    }
}
