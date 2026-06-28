/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-19 18:46:22
 * @FilePath     : /src/func/zotero/zoteroModal.ts
 * @LastEditTime : 2025-05-22 20:38:24
 * @Description  : 拷贝自思源 zotero 文件引用插件，做了一些修改
 * @Source       : https://github.com/WingDr/siyuan-plugin-citation
 */

import { showMessage } from "siyuan";

const ZOTERO_BASE_URL = 'http://127.0.0.1:23119';
const ZOTERO_LOCAL_API = `${ZOTERO_BASE_URL}/api/`;
const ZOTERO_CONNECTOR_PING = `${ZOTERO_BASE_URL}/connector/ping`;
const ZOTERO_BRIDGE_SELECTED = `${ZOTERO_BASE_URL}/f-zotero-ext/api/v1/selected`;

type BridgeResponse<T> = {
    ok: boolean;
    error?: string;
} & T;

interface ISelectedItem {
    key: string,
    title: string,
    publicationTitle?: string
    itemType: string,
    date: string,
    url: string,
    DOI: string,
    volume?: string,
}

type ZoteroApiItem = {
    key: string;
    data: {
        key: string;
        itemType: string;
        title?: string;
        note?: string;
    };
};

export class ZoteroDBModal {
    logger = {
        info: (msg: string, data?: any) => console.log(msg, data),
        error: (msg: string, data?: any) => console.error(msg, data)
    };

    public async getSelectedItems(): Promise<ISelectedItem[]> {
        if (!await this.checkZoteroRunning()) {
            showMessage("无法连接到 Zotero", 5000, 'error');
            return null;
        }
        return await this.getSelectedItemsFromBridge();
    }

    public async getItemNote(): Promise<Record<string, string>> {
        if (!await this.checkZoteroRunning()) {
            showMessage("无法连接到 Zotero", 5000, 'error');
            return null;
        }

        const selectedItems = await this.getSelectedItemsFromBridge();
        if (!selectedItems || selectedItems.length === 0) {
            return null;
        }

        const notes: Record<string, string> = {};
        for (const item of selectedItems) {
            const noteItems = await this.getItemNotes(item.key);
            for (const noteItem of noteItems) {
                const noteTitle = noteItem.data.title || item.title || noteItem.key;
                if (noteItem.data.note) {
                    notes[noteTitle] = noteItem.data.note;
                }
            }
        }
        return notes;
    }

    public async checkZoteroRunning(): Promise<boolean> {
        if (await this.isEndpointReachable(ZOTERO_LOCAL_API)) {
            return true;
        }
        return await this.isEndpointReachable(ZOTERO_CONNECTOR_PING);
    }

    private async getSelectedItemsFromBridge(): Promise<ISelectedItem[]> {
        const data = await this.fetchJson<BridgeResponse<{ items: ISelectedItem[] }>>(ZOTERO_BRIDGE_SELECTED);
        if (!data?.ok) {
            const error = data?.error ?? 'Bridge returned an invalid response';
            this.logger.error(error);
            showMessage('无法获取 Zotero 选中项，请确认 Bridge 扩展已安装', 5000, 'error');
            return null;
        }
        return data.items ?? [];
    }

    private async getItemNotes(itemKey: string): Promise<ZoteroApiItem[]> {
        const childrenUrl = `${ZOTERO_LOCAL_API}users/0/items/${itemKey}/children`;
        const children = await this.fetchJson<ZoteroApiItem[]>(childrenUrl);
        if (!children) {
            return [];
        }
        return children.filter(item => item.data?.itemType === 'note');
    }

    private async isEndpointReachable(url: string): Promise<boolean> {
        try {
            const response = await fetch(url);
            return response.ok;
        } catch (error) {
            this.logger.error(`Zotero endpoint is not reachable: ${url}`, error);
            return false;
        }
    }

    private async fetchJson<T>(url: string): Promise<T> {
        try {
            const response = await fetch(url, {
                headers: {
                    'Zotero-Allowed-Request': 'true',
                }
            });
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            this.logger.error(`Zotero request failed: ${url}`, error);
            return null;
        }
    }
}
