/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-19 18:46:22
 * @FilePath     : /src/func/zotero/zoteroModal.ts
 * @LastEditTime : 2025-05-22 20:38:24
 * @Description  : 拷贝自思源 zotero 文件引用插件，做了一些修改
 * @Source       : https://github.com/WingDr/siyuan-plugin-citation
 */
// import Fuse from "fuse.js";

import {
    // Plugin,
    // Protyle,
    showMessage
} from "siyuan";

import * as api from '@/api';
// import type FMiscPlugin from "@/index";
import { getPassword } from "./config";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";


// function processKey(key: string): [number, string] {
//     if (!key) return [1, key];
//     const group = key.split("_");
//     if (group.length <= 1 || isNaN(+group[0])) {
//         // 整个长度小于等于1（不含"_"或者为空）或者第一个字符不是数字的，都视为非新生成的
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
    // public plugin: Plugin;
    // public protyle: Protyle;

    logger = {
        info: (msg: string, data ?: any) => console.log(msg, data),
        error: (msg: string, data?: any) => console.error(msg, data)
    };

    constructor() {
        // this.plugin = plugin;
        let plugin = thisPlugin();
        this.absZoteroJSPath = `/data/plugins/${plugin.name}/zotero/`;
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

    public async getItemNote() {
        return this.requests(async () => {
            return await this._callZoteroJS("getItemNote", "");
        });
    }

    private async requests(call: CallableFunction) {
        let isRunning = await this.checkZoteroRunning();
        if (isRunning) {
            return await call();
        } else {
            showMessage("无法连接到 Zotero", 5000, 'error');
            return null;
        }
    }

    private async _getSelectedItems() {
        return await this._callZoteroJS("getSelectedItems", "");
    }

    public async checkZoteroRunning(): Promise<boolean> {
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

    /**
     * Execute JavaScript code in Zotero
     * @param code JavaScript code to execute
     * @returns Response from Zotero
     */
    public async executeZoteroJS(code: string) {
        const password = getPassword();
        const requestOptions = {
            method: "POST",
            headers: {
                'Authorization': `Bearer ${password}`,
                'Content-Type': 'text/plain',
                'Zotero-Allowed-Request': 'true'
            },
            body: code
        };

        try {
            let response = await fetch(
                `http://127.0.0.1:23119/debug-bridge/execute`, requestOptions
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
            return null;
        }
    }

    private async _callZoteroJS(filename: string, prefix: string) {
        const jsContent = await api.getFile(this.absZoteroJSPath + filename + ".js", "text");
        const code = prefix + "\n" + jsContent;
        return await this.executeZoteroJS(code);
    }
}
