/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-10 20:33:25
 * @FilePath     : /src/func/gpt/setting/components.tsx
 * @LastEditTime : 2024-12-21 17:04:08
 * @Description  : 
 */


import Form from "@/libs/components/Form";

import { children, JSX, onCleanup } from "solid-js";

import { IStoreRef } from "@frostime/solid-signal-ref";
import { UIConfig } from "./store";


export const ChatSessionSetting = (props: {
    insideTab?: boolean,
    config: IStoreRef<IChatSessionConfig>,
    onClose: () => void,
    children?: JSX.Element;
}) => {

    const { config } = props;

    const C = children(() => props.children);

    onCleanup(() => {
        props.onClose();
    });


    return (
        <div classList={{
            'config__tab-container': props.insideTab ?? false
        }} data-name="gpt" style={{width: '100%'}}>
            {C()}
            <h3 style={{padding: '5px 20px', "text-align": 'center'}}>GPT 对话参数</h3>
            <Form.Wrap
                title="附带历史消息"
                description="对话的时候附带的历史消息数量，包含用户输入的消息, 例如：<br/>附带 1 条(最低限度)，则只包含用户当前输入的 [user] 消息<br/>附带 3 条，则会包含 [user, assistant, user] 三条消息"
            >
                <Form.Input
                    type="number"
                    value={config().attachedHistory}
                    changed={(v) => {
                        v = v || '1';
                        config.update('attachedHistory', parseInt(v));
                    }}
                    number={{
                        min: 1,
                        step: 1
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
            <h3 style={{padding: '5px 20px', "text-align": 'center'}}>用户界面配置</h3>
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
        </div>
    );
};

