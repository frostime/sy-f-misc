/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 22:22:24
 * @FilePath     : /src/func/toggl/state/config.ts
 * @LastEditTime : 2025-01-12 11:28:37
 * @Description  : 
 */
import { debounce } from "@frostime/siyuan-plugin-kits";
import { type Plugin } from "siyuan";
import { createMemo } from "solid-js";
import { type Project, type User, type Tag } from "../api/types";
import { getMe, getProjects, getTags } from "../api/me";

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
//WARN computations created outside a `createRoot` or `render` will never be disposed
export const token64 = createMemo(() => btoa(config().token + ':api_token'));

//******************** Toggl Status ********************

export const me = createSignalRef<User>(null); //Toggl 当前用户

//WARN computations created outside a `createRoot` or `render` will never be disposed
export const isConnected = createMemo(() => me() !== undefined && me()?.api_token !== undefined);


export const projects = createSignalRef<Project[]>([]);
export const tags = createSignalRef<Tag[]>([]);

//WARN computations created outside a `createRoot` or `render` will never be disposed
export const projectNames = createMemo(() => Object.fromEntries(projects().map(p => [p.id, p.name])));

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

export const fetchProjectsTags = async () => {
    const [projectsRes, tagsRes] = await Promise.all([
        getProjects(),
        getTags()
    ]);

    if (projectsRes.ok) {
        projects(projectsRes.data);
    }

    if (tagsRes.ok) {
        tags(tagsRes.data);
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
    let ok = await fetchMe();
    if (!ok) {
        console.warn('Toggl: can not fetch user');
        return false;
    }
    await fetchProjectsTags();
    return true;
}
