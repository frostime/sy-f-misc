/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-10 20:33:25
 * @FilePath     : /src/func/gpt/setting/ChatSetting.tsx
 * @LastEditTime : 2025-02-14 20:51:33
 * @Description  :
 */


import Form from "@/libs/components/Form";

import { IStoreRef } from "@frostime/solid-signal-ref";
import { UIConfig, defaultModelId, listAvialableModels } from "./store";
import Heading from "./Heading";


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
                <Form.Input
                    type="textinput"
                    value={config().utilityModelId ?? ''}
                    changed={(v) => {
                        config.update('utilityModelId', v);
                    }}
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