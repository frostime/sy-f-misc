/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-10 20:33:25
 * @FilePath     : /src/func/gpt/setting/ChatSetting.tsx
 * @LastEditTime : 2026-05-03 00:35:56
 * @Description  :
 */


import Form from "@/libs/components/Form";
import { createMemo } from "solid-js";

import { IStoreRef } from "@frostime/solid-signal-ref";
import { UIConfig, defaultModelId, listAvialableModels, useModel } from "../model/store";
import Heading from "./Heading";
import { showMessage } from "siyuan";
import { SelectInput, TextInput } from "@/libs/components/Elements";
import { openIframeDialog } from "@/func/html-pages/core";
import { IPrivacyField } from "../privacy";
import { confirmDialog } from "@frostime/siyuan-plugin-kits";


const ChatSessionSetting = (props: {
    config: IStoreRef<IChatSessionConfig>,
    model?: () => IRuntimeLLM | null,
}) => {

    const { config } = props;

    const updateToggle = (key: ConfigurableChatOption, value: boolean) => {
        const current = config().chatOptionToggles || {};
        config.update('chatOptionToggles', {
            ...current,
            [key]: value,
        });
    };

    const currentModel = createMemo(() => props.model?.() ?? useModel(defaultModelId(), 'null'));
    const reasoningOptions = createMemo<Record<string, string>>(() => {
        const all: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
        const supported = currentModel()?.config?.options?.compat?.thinking?.supportedEfforts;
        const levels = supported?.length ? all.filter(level => supported.includes(level)) : all;

        const options: Record<string, string> = {};
        levels.forEach(level => options[level] = level);
        return options;
    });

    return (
        <>
            <Heading>GPT 对话参数</Heading>
            <Form.Wrap
                title="默认使用模型"
                description="可以在思源默认配置或者自定义配置中选择模型"
            >
                <Form.Input
                    type="select"
                    value={defaultModelId()}
                    changed={(v) => {
                        defaultModelId.update(v);
                    }}
                    options={listAvialableModels()}
                />
            </Form.Wrap>
            <Form.Wrap
                title="附带历史消息"
                description="对话的时候附带的历史消息数量，包含用户输入的消息, 例如：<br/>附带 0 条(最低限度)，则只包含用户当前输入的 [user] 消息<br/>附带 2 条，则会包含用户输入 + 过去两条消息;<br/>附带 -1 条，则会附带所有历史消息"
            >
                <Form.Input
                    type="number"
                    value={config().attachedHistory}
                    changed={(v) => {
                        v = v || '0';
                        config.update('attachedHistory', parseInt(v));
                    }}
                    number={{
                        min: -1,
                        step: 1
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="辅助任务模型"
                description="承担对话标题命名等杂活的模块；填入格式为 <code>Modelname@ProviderName</code>，比如 deepseek-chat@Deepseek<br/>如果不填写，就使用当前对话的模型; 或者填写 siyuan 代表使用思源内置的 AI 配置"
            >
                <TextInput
                    value={config().utilityModelId ?? ''}
                    onChanged={(v: string) => {
                        const model = useModel(v, 'null');
                        if (model) {
                            config.update('utilityModelId', v);
                        } else {
                            showMessage(`错误的 ID，未找到模型 ${v}`, 3000, 'error');
                            // config.update('utilityModelId', '');
                        }
                    }}
                    spellcheck={false}
                />
            </Form.Wrap>
            <Form.Wrap
                title="自动生成标题时输入限制"
                description="在进入对话时，会将头两条消息交给 GPT 自动生成标题; 这一选项用来限制输入给 GPT 的字符的最大长度"
            >
                <Form.Input
                    type="number"
                    value={config().maxInputLenForAutoTitle}
                    changed={(v) => {
                        v = v || '0';
                        config.update('maxInputLenForAutoTitle', parseInt(v) || 400);
                    }}
                    number={{
                        min: 5,
                        step: 1
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="转换数学符号"
                description="GPT 在输出公式的时候可能使用 \(..\) 符号，如果开启则会将内容转换为 $...$"
            >
                <Form.Input
                    type="checkbox"
                    value={config().convertMathSyntax ?? false}
                    changed={(v) => {
                        config.update('convertMathSyntax', v);
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="工具调用链最大轮次"
                description="插件允许LLM自动多轮调用工具实现复杂任务，该选项用来限制最大调用轮次，防止无限调用"
            >
                <Form.Input
                    type="number"
                    value={config().toolCallMaxRounds ?? 7}
                    changed={(v) => {
                        v = v || '0';
                        config.update('toolCallMaxRounds', parseInt(v));
                    }}
                    number={{
                        min: 1,
                        max: 20,
                        step: 1
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="Stream 模式"
                description="以 Stream 模式请求"
            >
                <Form.Input
                    type="checkbox"
                    value={config().chatOption.stream ?? true}
                    changed={(v) => {
                        config.update('chatOption', 'stream', v);
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="Stream 模式下渲染 Markdown"
                description="在 Stream 模式下是否实时渲染 Markdown，关闭后将只显示纯文本; 对性能会有负面影响"
            >
                <Form.Input
                    type="checkbox"
                    value={config().renderInStreamMode ?? true}
                    changed={(v) => {
                        config.update('renderInStreamMode', v);
                    }}
                />
            </Form.Wrap>
            <Heading>🧠 Reasoning</Heading>
            <Form.Wrap
                title="Reasoning Effort"
                description="模型的 reasoning 级别；toggle 开启后才会发送该参数。可在 Provider 配置 → 参数兼容中限制可用级别。"
            >
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    <Form.Input
                        type="checkbox"
                        value={config().chatOptionToggles?.reasoning_effort !== false}
                        changed={(v) => {
                            const current = config().chatOptionToggles || {};
                            const patch: Partial<Record<string, boolean>> = {
                                ...current,
                                reasoning_effort: v,
                            };
                            if (v && !config().chatOption.reasoning_effort) {
                                const supported = currentModel()?.config?.options?.compat?.thinking?.supportedEfforts;
                                const defaultEffort = supported?.length
                                    ? (supported.includes('medium') ? 'medium' : supported[Math.floor(supported.length / 2)])
                                    : 'medium';
                                config.update('chatOption', 'reasoning_effort', defaultEffort as ReasoningEffort);
                            }
                            config.update('chatOptionToggles', patch);
                        }}
                    />
                    <SelectInput
                        value={config().chatOption.reasoning_effort ?? ''}
                        changed={(v: string) => {
                            config.update('chatOption', 'reasoning_effort', v as ReasoningEffort);
                        }}
                        options={reasoningOptions()}
                    />
                </div>
            </Form.Wrap>
            <Heading>📐 采样参数</Heading>
            <Form.Wrap
                title="Temperature"
                description="模型温度参数，控制生成文本的多样性。勾选后才会发送该参数。"
            >
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    <Form.Input
                        type="checkbox"
                        value={config().chatOptionToggles?.temperature !== false}
                        changed={(v) => {
                            updateToggle('temperature', v);
                        }}
                    />
                    <Form.Input
                        type="slider"
                        value={config().chatOption.temperature ?? 1}
                        changed={(v) => {
                            config.update('chatOption', 'temperature', parseFloat(v));
                        }}
                        slider={{ min: 0, max: 2, step: 0.05 }}
                    />
                </div>
            </Form.Wrap>
            <Form.Wrap
                title="最大 Token 数"
                description="控制生成文本的最大 Token 数量。勾选后才会发送该参数。"
            >
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    <Form.Input
                        type="checkbox"
                        value={config().chatOptionToggles?.max_tokens !== false}
                        changed={(v) => {
                            updateToggle('max_tokens', v);
                        }}
                    />
                    <Form.Input
                        type="number"
                        value={config().chatOption.max_tokens}
                        changed={(v) => {
                            if (!v) return;
                            config.update('chatOption', 'max_tokens', parseInt(v));
                        }}
                        number={{ min: 1, step: 1 }}
                    />
                </div>
            </Form.Wrap>
            <Form.Wrap
                title="Top P"
                description="控制生成文本多样性。勾选后才会发送该参数，建议不要和温度参数同时使用。"
            >
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    <Form.Input
                        type="checkbox"
                        value={config().chatOptionToggles?.top_p !== false}
                        changed={(v) => {
                            updateToggle('top_p', v);
                        }}
                    />
                    <Form.Input
                        type="number"
                        value={config().chatOption.top_p}
                        changed={(v) => {
                            if (!v) return;
                            config.update('chatOption', 'top_p', parseFloat(v));
                        }}
                        number={{ min: 0, max: 1, step: 0.05 }}
                    />
                </div>
            </Form.Wrap>
            <Form.Wrap
                title="存在惩罚 (Presence Penalty)"
                description="避免重复已出现词的惩罚力度。勾选后才会发送该参数。"
            >
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    <Form.Input
                        type="checkbox"
                        value={config().chatOptionToggles?.presence_penalty !== false}
                        changed={(v) => {
                            updateToggle('presence_penalty', v);
                        }}
                    />
                    <Form.Input
                        type="number"
                        value={config().chatOption.presence_penalty}
                        changed={(v) => {
                            if (!v) return;
                            config.update('chatOption', 'presence_penalty', parseFloat(v));
                        }}
                        number={{ min: -2, max: 2, step: 0.05 }}
                    />
                </div>
            </Form.Wrap>
            <Form.Wrap
                title="频率惩罚 (Frequency Penalty)"
                description="减少重复词出现频率的惩罚力度。勾选后才会发送该参数。"
            >
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    <Form.Input
                        type="checkbox"
                        value={config().chatOptionToggles?.frequency_penalty !== false}
                        changed={(v) => {
                            updateToggle('frequency_penalty', v);
                        }}
                    />
                    <Form.Input
                        type="number"
                        value={config().chatOption.frequency_penalty}
                        changed={(v) => {
                            if (!v) return;
                            config.update('chatOption', 'frequency_penalty', parseFloat(v));
                        }}
                        number={{ min: -2, max: 2, step: 0.05 }}
                    />
                </div>
            </Form.Wrap>
            <Heading>隐私配置</Heading>
            <Form.Wrap
                title="启用隐私屏蔽"
                description="在发送消息给 LLM 之前自动屏蔽敏感信息，接收回复后自动恢复"
            >
                <Form.Input
                    type="checkbox"
                    value={config().enablePrivacyMask ?? false}
                    changed={(v) => {
                        config.update('enablePrivacyMask', v);
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="隐私字段配置"
                description="配置需要屏蔽的敏感信息规则"
            >
                <button
                    class="b3-button b3-button--outline"
                    onClick={() => {
                        const getCSSVar = (name) => (getComputedStyle(document.documentElement)
                            .getPropertyValue(name)
                            .trim())
                        // const colors = (1...13).forEach
                        const colors = Array.from({ length: 13 }, (_, i) => ([getCSSVar(`--b3-font-background${i + 1}`), getCSSVar(`--b3-font-color${i + 1}`)])
                        );
                        // const dialog = solidDialog({
                        const dialog = openIframeDialog({
                            title: '配置隐私屏蔽规则',
                            width: '900px',
                            height: '800px',
                            iframeConfig: {
                                type: 'url',
                                source: '/plugins/sy-f-misc/pages/chat-privacy-mask.html',
                                inject: {
                                    presetSdk: true,
                                    siyuanCss: true,
                                    customSdk: {
                                        getPrivacyFields: () => {
                                            // 注意一定要 unwrap，不然会传入一个 Proxy
                                            return structuredClone(config.unwrap().privacyFields) ?? [];
                                        },
                                        savePrivacyFields: (fields: IPrivacyField[]) => {
                                            config.update('privacyFields', fields);
                                            showMessage('隐私规则已保存', 2000, 'info');
                                            dialog.close();
                                        },
                                        close: () => {
                                            dialog.close();
                                        },
                                        confirm: async (text: string) => {
                                            return new Promise((resolve, reject) => {
                                                confirmDialog({
                                                    title: `确认`,
                                                    content: text,
                                                    confirm: () => resolve(true),
                                                    cancel: () => resolve(false)
                                                });
                                            })
                                        },
                                        colors
                                    }
                                }
                            }
                        });
                    }}
                >
                    配置隐私字段
                </button>
            </Form.Wrap >
            <Heading>用户对话配置</Heading>
            <Form.Wrap
                title="输入框字体"
                description="用户输入框的字体大小, 单位 px"
            >
                <Form.Input
                    type="number"
                    value={UIConfig().inputFontsize}
                    changed={(v) => {
                        if (!v) return;
                        UIConfig.update('inputFontsize', parseInt(v));
                    }}
                    number={{
                        min: 12,
                        max: 24,
                        step: 1
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="对话消息字体"
                description="对话消息的字体大小, 单位 px"
            >
                <Form.Input
                    type="number"
                    value={UIConfig().msgFontsize}
                    changed={(v) => {
                        if (!v) return;
                        UIConfig.update('msgFontsize', parseInt(v));
                    }}
                    number={{
                        min: 12,
                        max: 24,
                        step: 1
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="对话界面最大宽度"
                description="对话区域的最大的宽度, 单位 px"
            >
                <Form.Input
                    type="number"
                    value={UIConfig().maxWidth}
                    changed={(v) => {
                        if (!v) return;
                        UIConfig.update('maxWidth', parseInt(v));
                    }}
                    number={{
                        min: 500,
                        step: 1
                    }}
                />
            </Form.Wrap>
        </>
    );
};

export default ChatSessionSetting;