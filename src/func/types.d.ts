interface IConfigItem<T> extends Omit<ISettingItem, 'value'> {
    get: () => T;
    set: (value: T) => void;
}

interface IFuncModule {
    name: string;
    enabled: boolean;
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
        element: () => JSX.Element;
    }[];
    //如果模块的配置比较简单，可以用这个
    declareModuleConfig?: {
        key: string;
        items: IConfigItem<any>[];
        init: (itemValues?: Record<string, any>) => void;
    };
}
