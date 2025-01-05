import { useDevicewiseValue } from "@frostime/siyuan-plugin-kits";

export let name = "global-configs";
export let enabled = true;

const codeEditor = useDevicewiseValue('code');

interface IDefaultConfigs {
    codeEditor: string;
}

// Optional: Declare simple module config
export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "global-configs",
    title: "公用配置",
    load: (itemValues: IDefaultConfigs & {
        codeEditor: Record<string, string>
    }) => {
        codeEditor.init(itemValues.codeEditor);
    },
    dump: () => {
        return {
            codeEditor: codeEditor.storage,
        }
    },
    items: [
        {
            key: 'codeEditor',
            title: '打开代码编辑器',
            description: '在本地打开代码文件的命令; 默认为 code, 表示使用 vs code 打开',
            type: 'textinput',
            get: () => codeEditor.get(),
            set: (value: string) => {
                codeEditor.set(value);
            }
        }
    ],
};

export const sharedConfigs: Record<keyof IDefaultConfigs, () => any> = Object.fromEntries(
    declareModuleConfig.items.map(item => [item.key, item.get])
) as Record<keyof IDefaultConfigs, () => any>;

export const load = () => {
};

export const unload = () => {

};