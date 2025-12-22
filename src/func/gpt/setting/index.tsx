/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-21 11:29:20
 * @FilePath     : /src/func/gpt/setting/index.tsx
 * @LastEditTime : 2025-12-22 22:25:08
 * @Description  : 
 */
import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import Form from "@/libs/components/Form";
import { createSignal, Switch, Match, Show } from "solid-js";

// import { useModel, defaultConfig, providers, save, load } from "./store";
import * as store from "../model/store";
import ChatSetting from "./ChatSetting";
// import ProviderSetting from "./ProviderSetting";
import ProviderSettingV2 from "./ProviderSettingV2";
import { onCleanup } from "solid-js";
import PromptTemplateSetting from "./PromptTemplateSetting";
import { globalMiscConfigs } from "../model/store";
import Heading from "./Heading";

import { LoadModuleFileButtonGroup } from "@/libs/components/user-custom-module";
import { ToolsManagerSetting } from "./ToolsManagerSetting";
import { CustomScriptToolSetting } from "./CustomScriptToolSetting";
import { Rows } from "@/libs/components/Elements/Flex";
import { ButtonInput, TextInput } from "@/libs/components/Elements";
import { pruneOldTempToollogFiles, tempRoot } from "../tools/utils";

type TabType = 'chat' | 'prompt' | 'provider' | 'tools' | 'custom-scripts';


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
                <TabButton
                    active={activeTab() === 'tools'}
                    onClick={() => setActiveTab('tools')}
                >
                    <div style={{ display: 'flex', "align-items": "center", "justify-content": "center", gap: "8px" }}>
                        <span>🛠️</span>
                        <span>工具</span>
                    </div>
                </TabButton>
                <Show when={globalMiscConfigs().enableCustomScriptTools}>
                    <TabButton
                        active={activeTab() === 'custom-scripts'}
                        onClick={() => setActiveTab('custom-scripts')}
                    >
                        <div style={{ display: 'flex', "align-items": "center", "justify-content": "center", gap: "8px" }}>
                            <span>🐍</span>
                            <span>自定义脚本工具</span>
                        </div>
                    </TabButton>
                </Show>
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

                            <Heading>实验性功能</Heading>
                            <Form.Wrap
                                title="启用自定义脚本工具"
                                description="开启后，可以通过 Python 脚本扩展 GPT 工具能力。<br/>注意：需要重启插件后生效！"
                            >
                                <Form.Input
                                    type="checkbox"
                                    value={globalMiscConfigs().enableCustomScriptTools}
                                    changed={(v) => {
                                        globalMiscConfigs.update('enableCustomScriptTools', v);
                                    }}
                                />
                            </Form.Wrap>
                        </div>
                    </Match>

                    <Match when={activeTab() === 'prompt'}>
                        <Heading>
                            配置 Prompt 模板
                        </Heading>
                        <PromptTemplateSetting />
                    </Match>

                    <Match when={activeTab() === 'provider'}>
                        <Heading>
                            配置 LLM 提供商
                        </Heading>
                        <ProviderSettingV2 />
                        {/* <Heading>
                            其他配置
                        </Heading>
                        <Form.Wrap
                            title="视觉能力管理"
                            description="视觉/多模态能力现由每个模型的配置 (modalities.input) 决定，您可以在新的 Provider 管理中为特定模型启用图片输入。"
                        >
                            <div style={{
                                'font-size': '13px',
                                color: 'var(--b3-theme-on-surface)',
                                'line-height': 1.6
                            }}>
                                请在 Provider 配置中为模型设置对应的模态能力。
                            </div>
                        </Form.Wrap> */}
                    </Match>

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
                        <Form.Wrap
                            title="博查 API Key"
                            description="可前往 <a href='https://open.bochaai.com/home' target='_blank'>博查官网</a> 获取。"
                            direction="row"
                        >
                            <Form.Input
                                type="textinput"
                                value={globalMiscConfigs().bochaApiKey}
                                changed={(v) => {
                                    globalMiscConfigs.update('bochaApiKey', v);
                                }}
                                style={{
                                    width: '100%'
                                }}
                            />
                        </Form.Wrap>
                        <Form.Wrap
                            title="谷歌检索 API"
                            description="需要配置 API Key 和搜索引擎 ID; 国内可前往 <a href='https://developers.google.com/custom-search/v1/overview?hl=zh-cn' target='_blank'>谷歌官网</a> 获取，官方提供每天100次免费调用，可前往 <a href='https://console.cloud.google.com/apis/dashboard?hl=zh-cn&pli=1' target='_blank'>Console</a> 查看调用情况; 不配置会采用爬虫的方式抓取网页。GFW 网络环境自行解决。"
                            direction="row"
                        >
                            {/* <Form.Input
                                type="textinput"
                                value={globalMiscConfigs().bochaApiKey}
                                changed={(v) => {
                                    globalMiscConfigs.update('bochaApiKey', v);
                                }}
                                style={{
                                    width: '100%'
                                }}
                            /> */}
                            <TextInput
                                value={globalMiscConfigs().googleApiKey}
                                placeholder="Google API Key"
                                onChanged={(v) => {
                                    globalMiscConfigs.update('googleApiKey', v);
                                }}
                                style={{
                                    width: '100%'
                                }}
                            />
                             <TextInput
                                value={globalMiscConfigs().googleSearchEngineId}
                                placeholder="Google Search Engine ID"
                                onChanged={(v) => {
                                    globalMiscConfigs.update('googleSearchEngineId', v);
                                }}
                                style={{
                                    width: '100%'
                                }}
                            />
                        </Form.Wrap>
                        <Show when={window?.require?.('fs') !== undefined}>
                            <Form.Wrap
                                title="工具结果缓存"
                                description="工具结果将缓存在本地目录中, 点击清理会只保留最新的50条记录"
                                direction="column"
                            >
                                <Rows>
                                    <ButtonInput
                                        label="打开目录"
                                        onClick={() => {
                                            const electron = window?.require?.('electron');
                                            if (electron?.shell) {
                                                const tempDir = tempRoot();
                                                electron.shell.openPath(tempDir);
                                                // electron.shell.openPath(CUSTOM_SCRIPTS_DIR);
                                            }
                                        }}
                                    />
                                    <ButtonInput
                                        label="清理日志"
                                        onClick={async () => {
                                            pruneOldTempToollogFiles();
                                        }}
                                    />
                                </Rows>
                            </Form.Wrap>
                        </Show>

                        <Heading>
                            工具管理
                        </Heading>
                        <ToolsManagerSetting />
                    </Match>

                    <Match when={activeTab() === 'custom-scripts'}>
                        <Heading>
                            自定义脚本工具
                        </Heading>
                        {/* <Form.Wrap
                            title="重新导入自定义脚本工具"
                            description="从脚本目录重新加载工具定义，如果修改了脚本需要重新导入。注意：需要重启插件或刷新页面才能生效。"
                        >
                            <LoadModuleFileButtonGroup
                                moduleFilePath={`${dataDir}/snippets/fmisc-custom-toolscripts/`}
                                reloadModule={async () => {
                                    return store.loadCustomScriptTools();
                                }}
                            />
                        </Form.Wrap> */}
                        <CustomScriptToolSetting />
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
export * from "../model/store";
