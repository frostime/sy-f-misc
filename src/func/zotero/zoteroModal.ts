/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-19 18:46:22
 * @FilePath     : /src/func/zotero/zoteroModal.ts
 * @LastEditTime : 2024-06-24 16:03:42
 * @Description  : 拷贝自思源 zotero 文件引用插件，做了一些修改
 * @Source       : https://github.com/WingDr/siyuan-plugin-citation
 */
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

        const raw = prefix + "\n" + jsContent;
        const requestOptions = {
            method: "POST",
            headers: {
                'Authorization': `Bearer ${password}`,
                'Content-Type': 'application/javascript',
                'Zotero-Allowed-Request': 'true'
            },
            body: raw
        };

        try {
            let response = await fetch(
                `http://127.0.0.1:23119/debug-bridge/execute?password=${password}`, requestOptions
            );
            if (response.ok) {
                const data = await response.json();
                return data;
            } else {
                throw new Error(response.statusText);
            }
        } catch (e) {
            console.warn('远程链接 Zotero 失败');
            console.warn(e);
        }
    }
}
