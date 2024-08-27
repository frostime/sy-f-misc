import { debounce } from "@/utils";
import { type Plugin } from "siyuan";
import { createMemo, createSignal } from "solid-js";
import { createStore, unwrap } from 'solid-js/store'
import { type User } from "./api/types";
import { getMe } from "./api/me";

interface IConfig {
    token: string;
    dailynoteBox: NotebookId;
}

const [config, setConfig] = createStore<IConfig>({
    token: "",
    dailynoteBox: ""
});

const [me, setMe] = createSignal<User>();

const mergeConfig = (newConfig: Partial<IConfig>) => {
    setConfig(prevConfig => ({ ...prevConfig, ...newConfig }));
}

//Auth token in base64 format
const token64 = createMemo(() => btoa(config.token + ':api_token'));
const isConnected = createMemo(() => me() !== undefined && me()?.api_token !== undefined);

const StoreName = 'toggl.json';

const save_ = async (plugin: Plugin) => {
    let data = unwrap(config);
    plugin.saveData(StoreName, data);
}
const save = debounce(save_, 2000);
const load = async (plugin: Plugin) => {
    let data = await plugin.loadData(StoreName);
    data = data || {};
    if (data) {
        mergeConfig(data);
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
    isConnected
};

