import { createSettingAdapter } from "@frostime/siyuan-plugin-kits";

export let name = "global-configs";
export let enabled = true;

interface IDefaultConfigs {
    codeEditor: string;
}

const configDefinitions = [
    {
        key: 'codeEditor',
        type: 'textinput' as const,
        value: 'code',
        title: '打开代码编辑器',
        description: '在本地打开代码文件的命令; 默认为 code, 表示使用 vs code 打开',
        devicewise: true
    }
]

const configAdapter = createSettingAdapter(configDefinitions);

// Optional: Declare simple module config
export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "global-configs",
    title: "公用配置",
    load: (itemValues: any) => {
        configAdapter.init(itemValues);
    },
    dump: () => {
        return configAdapter.dump();
    },
    items: configDefinitions.map(item => {
        return {
            ...item,
            get: () => configAdapter.get(item.key),
            set: (value: any) => configAdapter.set(item.key, value)
        }
    }),
};

export const sharedConfigs = (key: keyof IDefaultConfigs) => {
    return configAdapter.get(key);
};

export const load = () => {
};

export const unload = () => {

};