/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:20
 * @FilePath     : /src/func/gpt/setting/index.tsx
 * @LastEditTime : 2025-01-21 18:14:55
 * @Description  : 
 */
import { debounce, thisPlugin } from "@frostime/siyuan-plugin-kits";
import Form from "@/libs/components/Form";

// import { useModel, defaultConfig, providers, save, load } from "./store";
import * as store from "./store";
import ChatSetting from "./ChatSetting";
import ProviderSetting from "./ProviderSetting";
import { onCleanup } from "solid-js";
import PromptTemplateSetting from "./PromptTemplateSetting";
import { globalMiscConfigs } from "./store";


/**
 * 指定设置默认的配置
 */
const GlobalSetting = () => {
    onCleanup(() => {
        store.save(thisPlugin());
    });

    const VisualModel = {
        value: () => {
            return store.visualModel.value.join('\n');
        },
        changed: (value: string) => {
            const models = value.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
            store.visualModel.update(models);
        }
    }

    return (
        <div class={'config__tab-container'} data-name="gpt" style={{ width: '100%' }}>
            <ChatSetting config={store.defaultConfig} />
            <Form.Wrap
                title="视觉模型"
                description="支持上传图片的模型，使用英文逗号或者换行符分隔"
                direction="row"
            >
                <Form.Input
                    type="textarea"
                    value={VisualModel.value()}
                    changed={VisualModel.changed}
                    style={{
                        width: "100%",
                        'font-size': '1.2em',
                        'line-height': '1.1em'
                    }}
                    spellcheck={false}
                />
            </Form.Wrap>
            <Form.Wrap
                title="选中内容格式"
                description="用户选中内容时，插入到对话中的格式。使用 {{content}} 作为占位符表示选中的内容"
                direction="row"
            >
                <Form.Input
                    type="textarea"
                    value={globalMiscConfigs().userSelectedContextFormat}
                    changed={(v) => {
                        globalMiscConfigs.update('userSelectedContextFormat', v);
                    }}
                    style={{
                        'font-size': '1.2em',
                        'line-height': '1.1em',
                        height: '6em'
                    }}
                />
            </Form.Wrap>
            <PromptTemplateSetting />
            <ProviderSetting />
        </div>
    );
}

export {
    ChatSetting,
    GlobalSetting
}
export * from "./store";
