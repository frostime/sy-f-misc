/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-10 20:33:25
 * @FilePath     : /src/func/gpt/setting/ChatSetting.tsx
 * @LastEditTime : 2025-12-31 20:25:47
 * @Description  :
 */


import Form from "@/libs/components/Form";

import { IStoreRef } from "@frostime/solid-signal-ref";
import { UIConfig, defaultModelId, listAvialableModels, useModel } from "../model/store";
import Heading from "./Heading";
import { showMessage } from "siyuan";
import { SelectInput, TextInput } from "@/libs/components/Elements";
import { openIframDialog } from "@/func/html-pages/core";
import { IPrivacyField } from "../privacy";
import { confirmDialog } from "@frostime/siyuan-plugin-kits";


const ChatSessionSetting = (props: {
    config: IStoreRef<IChatSessionConfig>,
}) => {

    const { config } = props;

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
            <Form.Wrap
                title="Temperature"
                description="模型温度参数, 用于控制生成文本的多样性"
            >
                <Form.Input
                    type="slider"
                    value={config().chatOption.temperature ?? 1}
                    changed={(v) => {
                        config.update('chatOption', 'temperature', parseFloat(v));
                    }}
                    slider={{
                        min: 0,
                        max: 2,
                        step: 0.05
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="最大 Token 数"
                description="控制生成文本的最大 Token 数量"
            >
                <Form.Input
                    type="number"
                    value={config().chatOption.max_tokens}
                    changed={(v) => {
                        if (!v) return;
                        config.update('chatOption', 'max_tokens', parseInt(v));
                    }}
                    number={{
                        min: 1,
                        step: 1
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="Top P"
                description="控制生成文本的多样性。值越低，生成的文本越保守和确定性；值越高（最大为1），生成的文本越多样和随机。建议不要和温度参数一同变更。"
            >
                <Form.Input
                    type="number"
                    value={config().chatOption.top_p}
                    changed={(v) => {
                        if (!v) return;
                        config.update('chatOption', 'top_p', parseFloat(v));
                    }}
                    number={{
                        min: 0,
                        max: 1,
                        step: 0.05
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="存在惩罚 (Presence Penalty)"
                description="控制生成文本中是否使用已出现过的词的惩罚力度。值越高（最大为2），模型越倾向于避免使用已出现过的词，从而鼓励生成更多新词。"
            >
                <Form.Input
                    type="number"
                    value={config().chatOption.presence_penalty}
                    changed={(v) => {
                        if (!v) return;
                        config.update('chatOption', 'presence_penalty', parseFloat(v));
                    }}
                    number={{
                        min: -2,
                        max: 2,
                        step: 0.05
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="频率惩罚 (Frequency Penalty)"
                description="控制生成文本中频繁出现的词的惩罚力度。值越高（最大为2），模型越倾向于减少重复词的出现频率，从而增加模型谈论新主题的可能性。"
            >
                <Form.Input
                    type="number"
                    value={config().chatOption.frequency_penalty}
                    changed={(v) => {
                        if (!v) return;
                        config.update('chatOption', 'frequency_penalty', parseFloat(v));
                    }}
                    number={{
                        min: -2,
                        max: 2,
                        step: 0.05
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="Reasoning Effort"
                description="OpenAI 系的推理模型允许指定推理强度"
            >
                <SelectInput
                    value={config().chatOption.reasoning_effort}
                    changed={(v: IChatCompleteOption['reasoning_effort'] | null) => {
                        if (!v) return;
                        config.update('chatOption', 'reasoning_effort', v);
                    }}
                    options={{
                        "": "不设置",
                        "none": "none",
                        "minimal": "minimal",
                        "low": "low",
                        "medium": "medium",
                        "high": "high",
                        "xhigh": "xhing"
                    }}
                />
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
                        // const dialog = solidDialog({
                        const dialog = openIframDialog({
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
                                        }
                                    }
                                }
                            }
                        });
                    }}
                >
                    配置隐私字段
                </button>
            </Form.Wrap>
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