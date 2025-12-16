/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-02 21:39:30
 * @FilePath     : /src/func/types.d.ts
 * @LastEditTime : 2025-12-17 01:29:21
 * @Description  : 
 */
interface IConfigItem<T> extends Omit<ISettingItem, 'value'> {
    get: () => T;
    set: (value: T) => void;
}

type ExternalElementWithDispose = {
    element: HTMLElement;
    dispose?: () => void;
};

type FlexibleElement = JSX.Element | HTMLElement | ExternalElementWithDispose;

interface IFuncModule {
    name: string;
    enabled: boolean;
    allowToUse?: () => boolean;

    load: (plugin: FMiscPlugin) => void;
    unload: (plugin?: FMiscPlugin) => void;
    // 如果声明了, 在会在设置面板中显示启用的按钮
    declareToggleEnabled?: {
        title: string;
        description: string;
        defaultEnabled?: boolean;
    },
    // 放入 Setting 面板中的界面, 如果模块的设置比较复杂, 可以单独声明一个 Setting 面板
    declareSettingPanel?: {
        key: string;
        title: string;
        element: () => FlexibleElement;
    }[];
    //如果模块的配置比较简单，可以用这个
    declareModuleConfig?: {
        key: string;
        title?: string;
        items: IConfigItem<any>[];
        load: (itemValues?: Record<string, any>) => void;
        dump?: () => Record<string, any>;
        customPanel?: () => FlexibleElement;
    };
}
