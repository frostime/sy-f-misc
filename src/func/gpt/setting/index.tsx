/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:20
 * @FilePath     : /src/func/gpt/setting/index.tsx
 * @LastEditTime : 2025-01-30 00:00:27
 * @Description  : 
 */
import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import Form from "@/libs/components/Form";
import { createSignal, Switch, Match } from "solid-js";

// import { useModel, defaultConfig, providers, save, load } from "./store";
import * as store from "./store";
import ChatSetting from "./ChatSetting";
import ProviderSetting from "./ProviderSetting";
import { onCleanup } from "solid-js";
import PromptTemplateSetting from "./PromptTemplateSetting";
import { globalMiscConfigs } from "./store";
import Heading from "./Heading";

type TabType = 'chat' | 'prompt' | 'provider';

const TabButton = (props: {
    active: boolean;
    onClick: () => void;
    children: any;
}) => {
    return (
        <button
            class={`b3-button b3-button--text`}
            style={{
                "padding": "12px 0",
                "border-radius": "0",
                "font-weight": props.active ? "bold" : "normal",
                "background-color": 'var(--b3-theme-background)',
                "border-bottom": props.active ? "2px solid var(--b3-theme-primary)" : "none",
                "flex": "1",
                "min-width": "120px",
                "font-size": "14px",
                "color": props.active ? "var(--b3-theme-primary)" : "var(--b3-theme-on-surface)"
            }}
            onClick={props.onClick}
        >
            {props.children}
        </button>
    );
};

/**
 * 指定设置默认的配置
 */
const GlobalSetting = () => {
    onCleanup(() => {
        store.save(thisPlugin());
    });

    const [activeTab, setActiveTab] = createSignal<TabType>('chat');

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
        <div class={'config__tab-container'}
            data-name="gpt"
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                'flex-direction': 'column'
            }}
        >
            <div style={{
                display: 'flex',
                width: '100%',
                "border-bottom": "1px solid var(--b3-border-color)",
                "background-color": "var(--b3-theme-background)",
                position: "sticky",
                top: 0,
                "z-index": 10
            }}>
                <TabButton
                    active={activeTab() === 'chat'}
                    onClick={() => setActiveTab('chat')}
                >
                    <div style={{ display: 'flex', "align-items": "center", "justify-content": "center", gap: "8px" }}>
                        <span>💬</span>
                        <span>对话设置</span>
                    </div>
                </TabButton>
                <TabButton
                    active={activeTab() === 'prompt'}
                    onClick={() => setActiveTab('prompt')}
                >
                    <div style={{ display: 'flex', "align-items": "center", "justify-content": "center", gap: "8px" }}>
                        <span>📝</span>
                        <span>Prompt 模板</span>
                    </div>
                </TabButton>
                <TabButton
                    active={activeTab() === 'provider'}
                    onClick={() => setActiveTab('provider')}
                >
                    <div style={{ display: 'flex', "align-items": "center", "justify-content": "center", gap: "8px" }}>
                        <span>🔌</span>
                        <span>Provider 配置</span>
                    </div>
                </TabButton>
            </div>

            <div style={{
                padding: '16px',
                flex: 1,
                'overflow-y': 'auto'
            }}>
                <Switch fallback={<div>404: Tab not found</div>}>
                    <Match when={activeTab() === 'chat'}>
                        <div>
                            <ChatSetting config={store.defaultConfig} />
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
                        </div>
                    </Match>

                    <Match when={activeTab() === 'prompt'}>
                        <PromptTemplateSetting />
                    </Match>

                    <Match when={activeTab() === 'provider'}>
                        <ProviderSetting />
                        <Heading>
                            其他配置
                        </Heading>
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
                    </Match>
                </Switch>
            </div>
        </div>
    );
}

export {
    ChatSetting,
    GlobalSetting
}
export * from "./store";
