/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-10 20:33:25
 * @FilePath     : /src/func/gpt/setting/ChatSetting.tsx
 * @LastEditTime : 2024-12-22 18:01:28
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
                title="Temperature"
                description="模型温度参数, 用于控制生成文本的多样性"
            >
                <Form.Input
                    type="slider"
                    value={config().temperature ?? 1}
                    changed={(v) => {
                        config.update('temperature', parseFloat(v));
                    }}
                    slider={{
                        min: 0,
                        max: 2,
                        step: 0.1
                    }}
                />
            </Form.Wrap>
            <Heading>用户界面配置</Heading>
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