/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:20
 * @FilePath     : /src/func/gpt/setting/index.tsx
 * @LastEditTime : 2025-05-15 12:43:43
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

import { LoadModuleFileButtonGroup } from "@/libs/components/user-custom-module";

type TabType = 'chat' | 'prompt' | 'provider' | 'tools';


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

let cp: any;
try {
    cp = window?.require?.('child_process');
} catch (e) {
    cp = null;
}

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

    const plugin = thisPlugin();
    const dataDir = window.siyuan.config.system.dataDir;
    const petalDir = `${dataDir}/storage/petal/${plugin.name}`;

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
                {/* #if [PRIVATE_ADD] */}
                <TabButton
                    active={activeTab() === 'tools'}
                    onClick={() => setActiveTab('tools')}
                >
                    <div style={{ display: 'flex', "align-items": "center", "justify-content": "center", gap: "8px" }}>
                        <span>🛠️</span>
                        <span>工具</span>
                    </div>
                </TabButton>
                {/* #endif */}
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
                                title="侧边对话栏目"
                                description="开启后，会在侧边栏中固定一个对话窗口; 重启后生效"
                            >
                                <Form.Input
                                    type="checkbox"
                                    value={globalMiscConfigs().pinChatDock}
                                    changed={(v) => {
                                        globalMiscConfigs.update('pinChatDock', v);
                                    }}
                                />
                            </Form.Wrap>
                            <Form.Wrap
                                title="消息日志"
                                description="开启后，自动记录所有和 LLM API 的网络消息"
                            >
                                <Form.Input
                                    type="checkbox"
                                    value={globalMiscConfigs().enableMessageLogger}
                                    changed={(v) => { globalMiscConfigs.update('enableMessageLogger', v) }}
                                />
                            </Form.Wrap>
                            <Form.Wrap
                                title="消息日志条数"
                                description="记录的消息记录的最大条数"
                            >
                                <Form.Input
                                    type="number"
                                    value={globalMiscConfigs().maxMessageLogItems}
                                    changed={(v) => { globalMiscConfigs.update('maxMessageLogItems', v) }}
                                />
                            </Form.Wrap>
                            <Heading>其他设置</Heading>
                            <Form.Wrap
                                title="隐私关键词"
                                description="在使用 @ 添加上下文的时候，如果有屏蔽隐私的需求请在这里配置<br/> 每行一个关键词，这些关键词在 GPT 附带的上下文中会被替换为隐私屏蔽词"
                                direction="row"
                            >
                                <Form.Input
                                    type="textarea"
                                    value={globalMiscConfigs().privacyKeywords}
                                    changed={(v) => {
                                        globalMiscConfigs.update('privacyKeywords', v);
                                    }}
                                    style={{
                                        height: '100px'
                                    }}
                                />
                            </Form.Wrap>

                            <Form.Wrap
                                title="隐私屏蔽词"
                                description="用于替换隐私关键词的文本，默认为 ***"
                            >
                                <Form.Input
                                    type="textinput"
                                    value={globalMiscConfigs().privacyMask}
                                    changed={(v) => {
                                        globalMiscConfigs.update('privacyMask', v || '***');
                                    }}
                                />
                            </Form.Wrap>

                            <Form.Wrap
                                title="导出 Markdown 时跳过隐藏消息"
                                description="开启后，导出为 Markdown 时将跳过处于隐藏状态的消息; 此选项不影响归档"
                            >
                                <Form.Input
                                    type="checkbox"
                                    value={globalMiscConfigs().exportMDSkipHidden}
                                    changed={(v) => {
                                        globalMiscConfigs.update('exportMDSkipHidden', v);
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

                    {/* #if [PRIVATE_ADD] */}
                    <Match when={activeTab() === 'tools'}>
                        <Heading>
                            Custom Scripts
                        </Heading>
                        <Form.Wrap
                            title="自定义对话参数预处理模块"
                            description={`自定义 JS 函数，对输入的模型参数进行预处理更改，例如实现 Deepseek v3 0324 的温度缩放、适配硅基流动 max token 限制等; 重启后生效`}
                        >
                            <LoadModuleFileButtonGroup
                                moduleFilePath={`${petalDir}/${store.preprocessModuleJsName}`}
                                reloadModule={async () => {
                                    return store.loadCustomPreprocessModule();
                                }}
                            />
                        </Form.Wrap>
                        <Form.Wrap
                            title="自定义的 Context Provider"
                            description={`在代码中自行实现 ContextProvider`}
                        >
                            <LoadModuleFileButtonGroup
                                moduleFilePath={`${petalDir}/${store.contextProviderModuleJsName}`}
                                reloadModule={async () => {
                                    return store.loadCustomContextProviderModule();
                                }}
                            />
                        </Form.Wrap>
                        <Heading>
                            工具配置
                        </Heading>
                        <Form.Wrap
                            title="Tavily API Key"
                            description="可前往 <a href='https://app.tavily.com/home' target='_blank'>Tavily 官网</a> 获取。"
                            direction="row"
                        >
                            <Form.Input
                                type="textinput"
                                value={globalMiscConfigs().tavilyApiKey}
                                changed={(v) => {
                                    globalMiscConfigs.update('tavilyApiKey', v);
                                }}
                                style={{
                                    width: '100%'
                                }}
                            />
                        </Form.Wrap>
                    </Match>
                    {/* #endif */}
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
