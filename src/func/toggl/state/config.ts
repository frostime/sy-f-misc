/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 22:22:24
 * @FilePath     : /src/func/toggl/state/config.ts
 * @LastEditTime : 2025-01-02 10:25:22
 * @Description  : 
 */
import { debounce } from "@frostime/siyuan-plugin-kits";
import { type Plugin } from "siyuan";
import { createMemo } from "solid-js";
import { type Project, type User } from "../api/types";
import { getMe } from "../api/me";

import { createSignalRef, createStoreRef } from "@frostime/solid-signal-ref";
// export * from "./active";

//******************** Config ********************

interface IConfig {
    token: string;
    dailynoteBox: NotebookId;
    dnAutoFetch: boolean; //自动获取今天的 toggl 活动
    dnAutoFetchInterval: number; //自动获取今天的 toggl 活动的时间间隔 (分钟)
    topDevice: string; //最高优先级的设备的 ID
    miniTimerType: 'none' | 'statusBar' | 'bubble';
}

export const config = createStoreRef<IConfig>({
    token: "",
    dailynoteBox: "",
    dnAutoFetch: false,
    dnAutoFetchInterval: 60,
    topDevice: "",
    miniTimerType: 'statusBar'
});

const mergeConfig = (newConfig: Partial<IConfig>) => {
    config.update(prevConfig => ({ ...prevConfig, ...newConfig }));
}

//Auth token in base64 format
export const token64 = createMemo(() => btoa(config().token + ':api_token'));

//******************** Toggl Status ********************

export const me = createSignalRef<User>(null); //Toggl 当前用户

export const isConnected = createMemo(() => me() !== undefined && me()?.api_token !== undefined);

interface IProject extends Project {
    bind_siyuan_doc?: DocumentId;
}
export const projects = createStoreRef<Record<string, IProject>>({});

export const fetchMe = async () => {
    try {
        let dataMe = await getMe();
        if (dataMe.ok) {
            me.update(dataMe.data);
        }
        return true;
    } catch (error) {
        console.error('Failed to get me:', error);
        return false;
    }
}

//******************** Data IO ********************

const StoreName = 'toggl.json';

const save_ = async (plugin: Plugin) => {
    let data = config.unwrap();
    plugin.saveData(StoreName, data);
    console.debug('Save toggl data:', data);
}
export const save = debounce(save_, 2000);

export const load = async (plugin: Plugin) => {
    let data = await plugin.loadData(StoreName);
    data = data || {};
    if (data) {
        console.debug('Load toggl data:', data);
        mergeConfig(data);
        console.debug('Merge toggl data:', config);
    }
}
