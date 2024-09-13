import { debounce } from "@/utils";
import { type Plugin } from "siyuan";
import { createMemo, createSignal } from "solid-js";
import { createStore, unwrap } from 'solid-js/store'
import { type Project, type User } from "./api/types";
import { getMe } from "./api/me";

//******************** Config ********************

interface IConfig {
    token: string;
    dailynoteBox: NotebookId;
    dnAutoFetch: boolean; //自动获取今天的 toggl 活动
    dnAutoFetchInterval: number; //自动获取今天的 toggl 活动的时间间隔 (分钟)
    topDevice: string; //最高优先级的设备的 ID
}

const [config, setConfig] = createStore<IConfig>({
    token: "",
    dailynoteBox: "",
    dnAutoFetch: false,
    dnAutoFetchInterval: 60,
    topDevice: "",
});

const mergeConfig = (newConfig: Partial<IConfig>) => {
    setConfig(prevConfig => ({ ...prevConfig, ...newConfig }));
}

//Auth token in base64 format
const token64 = createMemo(() => btoa(config.token + ':api_token'));


//******************** Toggl Status ********************

const [me, setMe] = createSignal<User>(); //Toggl 当前用户

const isConnected = createMemo(() => me() !== undefined && me()?.api_token !== undefined);

interface IProject extends Project {
    bind_siyuan_doc?: DocumentId;
}
const [projects, setProjects] = createStore<Record<string, IProject>>({}); //Toggl 所有 Project

// const [tags, setTags] = createStore<Record<string,Tag>>({}); //Toggl 所有 Tag

//******************** Data IO ********************

const StoreName = 'toggl.json';

const save_ = async (plugin: Plugin) => {
    let data = unwrap(config);
    plugin.saveData(StoreName, data);
    console.debug('Save toggl data:', data);
}
const save = debounce(save_, 2000);
const load = async (plugin: Plugin) => {
    let data = await plugin.loadData(StoreName);
    data = data || {};
    if (data) {
        console.debug('Load toggl data:', data);
        mergeConfig(data);
        console.debug('Merge toggl data:', config);
        getMe().then((data) => {
            if (data.ok) {
                setMe(data.data);
            }
        }); //初始化的时候，获取当前的用户
    }
}

export { 
    config,
    setConfig,
    mergeConfig,
    token64,
    load,
    save,
    me,
    setMe,
    isConnected,
    projects,
    setProjects,
};

