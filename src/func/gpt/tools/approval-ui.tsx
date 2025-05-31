/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-15 16:30:14
 * @FilePath     : /src/func/gpt/tools/approval-ui.tsx
 * @Description  : 工具审核 UI 组件和适配器
 */
import { Component, createMemo } from "solid-js";
import { ToolExecuteResult, ApprovalUIAdapter, DisplayMode } from "./types";
import { ButtonInput } from "@/libs/components/Elements";
import { solidDialog } from "@/libs/dialog";
import Markdown from "@/libs/components/Elements/Markdown";
import { createSignalRef } from "@frostime/solid-signal-ref";
// import { json } from "stream/consumers";

/**
 * 工具执行审核组件
 */
export const ToolExecutionApprovalUI: Component<{
    toolName: string;
    toolDescription: string;
    args: Record<string, any>;
    onApprove: () => void;
    onReject: (reason?: string) => void;
    displayMode: DisplayMode;
}> = (props) => {

    const reason = createSignalRef('');

    const md = `
### 允许执行工具 ${props.toolName}？

**描述:** ${props.toolDescription}

**参数:**

${Object.keys(props.args).map(key => `- \`${key}\`: \`${props.args[key]}\``).join('\n')}

`;

    return (
        <div style={{
            "padding": "16px",
            "width": "100%"
        }}>
            <Markdown markdown={md} />


            <div style={{
                "display": "flex",
                "align-content": "center",
                "gap": "8px"
            }}>
                <input type="text"
                    class="b3-text-field" placeholder="可选的拒绝理由" value={reason()}
                    onInput={(e) => reason(e.currentTarget.value)}
                    style="width: unset; max-width: unset; flex: 1; display: inline-block;"
                />

                <ButtonInput
                    label="拒绝"
                    onClick={() => props.onReject(reason())}
                    style={{
                        "background-color": "var(--b3-theme-error)",
                        "font-size": props.displayMode === DisplayMode.INLINE ? "14px" : "12px"
                    }}
                />
                <ButtonInput
                    label="允许"
                    onClick={() => props.onApprove()}
                    style={{
                        "font-size": props.displayMode === DisplayMode.INLINE ? "14px" : "12px"
                    }}
                />
            </div>
        </div>
    );
};

/**
 * 工具结果审核组件
 */
export const ToolResultApprovalUI: Component<{
    toolName: string;
    args: Record<string, any>;
    result: ToolExecuteResult;
    onApprove: () => void;
    onReject: () => void;
    displayMode: DisplayMode;
}> = (props) => {

    const md = `
### 允许将工具 ${props.toolName} 的结果发送给 LLM？

**参数:**

${Object.keys(props.args).map(key => `- \`${key}\`: \`${props.args[key]}\``).join('\n')}


**结果:**

${props.result.data}
`;

    return (
        <div style={{
            "padding": "16px",
            "width": "100%"
        }}>
            <Markdown markdown={md} />

            <div style={{
                "display": "flex",
                "justify-content": "space-between",
                "align-content": "center",
                "gap": "8px"
            }}>
                <ButtonInput
                    label="拒绝"
                    onClick={props.onReject}
                    style={{
                        "background-color": "var(--b3-theme-error)",
                        "font-size": props.displayMode === DisplayMode.INLINE ? "14px" : "12px"
                    }}
                />
                <ButtonInput
                    label="允许"
                    onClick={props.onApprove}
                    style={{
                        "font-size": props.displayMode === DisplayMode.INLINE ? "14px" : "12px"
                    }}
                />
            </div>
        </div>
    );
};

/**
 * 文档内聊天审核 UI 适配器
 * 使用对话框显示审核 UI
 */
export class DefaultUIAdapter implements ApprovalUIAdapter {
    async showToolExecutionApproval(
        toolName: string,
        toolDescription: string,
        args: Record<string, any>
    ): Promise<{
        approved: boolean;
        rejectReason?: string;
    }> {
        return new Promise((resolve) => {
            const { close } = solidDialog({
                title: `工具执行审核`,
                loader: () => (
                    <ToolExecutionApprovalUI
                        toolName={toolName}
                        toolDescription={toolDescription}
                        args={args}
                        displayMode={DisplayMode.DIALOG}
                        onApprove={() => {
                            close();
                            resolve({
                                approved: true
                            });
                        }}
                        onReject={(reason?: string) => {
                            close();
                            resolve({
                                approved: false,
                                rejectReason: reason?.trim() || '用户拒绝执行工具'
                            });
                        }}
                    />
                ),
                width: '640px',
                maxHeight: '90%',
                callback: () => {
                    resolve({
                        approved: false,
                        rejectReason: '用户拒绝执行工具'
                    });
                }
            });
        });
    }

    async showToolResultApproval(
        toolName: string,
        args: Record<string, any>,
        result: ToolExecuteResult
    ): Promise<{
        approved: boolean;
        rejectReason?: string;
    }> {
        return new Promise((resolve) => {
            const { close } = solidDialog({
                title: `工具结果审核`,
                loader: () => (
                    <ToolResultApprovalUI
                        toolName={toolName}
                        args={args}
                        result={result}
                        displayMode={DisplayMode.DIALOG}
                        onApprove={() => {
                            close();
                            resolve({
                                approved: true
                            });
                        }}
                        onReject={() => {
                            close();
                            resolve({
                                approved: false,
                                rejectReason: '用户拒绝发送结果'
                            });
                        }}
                    />
                ),
                width: '640px',
                maxHeight: '90%',
                callback: () => {
                    resolve({
                        approved: false,
                        rejectReason: '用户关闭了审核对话框'
                    });
                }
            });
        });
    }
}
