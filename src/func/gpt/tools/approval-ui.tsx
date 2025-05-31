/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-15 16:30:14
 * @FilePath     : /src/func/gpt/tools/approval-ui.tsx
 * @Description  : 工具审核 UI 组件和适配器
 */
import { Component, JSX } from "solid-js";
import { ToolExecuteResult, ApprovalUIAdapter } from "./types";
import { ButtonInput } from "@/libs/components/Elements";
import { solidDialog } from "@/libs/dialog";
import Markdown from "@/libs/components/Elements/Markdown";
import { createSignalRef } from "@frostime/solid-signal-ref";

/**
 * 将对象参数格式化为Markdown列表
 */
const formatArgsToMarkdown = (args: Record<string, any>): string => {
    return Object.keys(args).map(key => {
        if (args[key] instanceof String) {
            if (args[key].includes('\n')) {
                return `- \`${key}\`:
\`\`\`
${args[key]}
\`\`\`
`;
            } else {
                return `- \`${key}\`: \`${args[key]}\``;
            }
        } else {
            return `- \`${key}\`: \`${args[key]}\``;
        }
    }).join('\n');
};


const BaseApprovalUI = (props: {
    markdown: string;
    onApprove: () => void;
    onReject: (reason?: string) => void;
    showReasonInput?: boolean;
    children?: JSX.Element;
}) => {
    const reason = createSignalRef('');

    return (
        <div style={{
            "padding": "16px",
            "width": "100%"
        }}>
            <Markdown markdown={props.markdown} />

            {props.children}

            <div style={{
                "display": "flex",
                "align-content": "center",
                "gap": "8px"
            }}>
                {props.showReasonInput && (
                    <input
                        type="text"
                        class="b3-text-field"
                        placeholder="可选的拒绝理由"
                        value={reason()}
                        onInput={(e) => reason(e.currentTarget.value)}
                        style="width: unset; max-width: unset; flex: 1; display: inline-block;"
                    />
                )}

                <ButtonInput
                    label="拒绝"
                    onClick={() => props.onReject(props.showReasonInput ? reason() : undefined)}
                    style={{
                        "background-color": "var(--b3-theme-error)",
                        "font-size": "12px"
                    }}
                />
                <ButtonInput
                    label="允许"
                    onClick={() => props.onApprove()}
                    style={{
                        "font-size": "12px"
                    }}
                />
            </div>
        </div>
    );
};

/**
 * 工具执行审核组件
 */
export const ToolExecutionApprovalUI: Component<{
    toolName: string;
    toolDescription: string;
    args: Record<string, any>;
    onApprove: () => void;
    onReject: (reason?: string) => void;
}> = (props) => {
    const markdown = `
### 允许执行工具 ${props.toolName}？

**描述:** ${props.toolDescription}

**参数:**

${formatArgsToMarkdown(props.args)}
`;

    return (
        <BaseApprovalUI
            markdown={markdown}
            onApprove={props.onApprove}
            onReject={props.onReject}
            showReasonInput={true}
        />
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
}> = (props) => {
    const markdown = `
### 允许将工具 ${props.toolName} 的结果发送给 LLM？

**参数:**

${formatArgsToMarkdown(props.args)}

**结果:**

`;

    return (
        <BaseApprovalUI
            markdown={markdown}
            onApprove={props.onApprove}
            onReject={() => props.onReject()}
            showReasonInput={false}
        >
            <textarea
                class="b3-text-field"
                style={{
                    "width": "100%",
                    "height": "120px",
                    "margin": "8px 0",
                    "resize": "vertical",
                    "font-family": "var(--b3-font-family-code)"
                }}
                rows={6}
                readOnly
                value={props.result.data}
            />
        </BaseApprovalUI>
    );
};

// 审核对话框的共同配置
const dialogConfig = {
    width: '640px',
    maxHeight: '90%'
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
                title: '工具执行审核',
                loader: () => (
                    <ToolExecutionApprovalUI
                        toolName={toolName}
                        toolDescription={toolDescription}
                        args={args}
                        onApprove={() => {
                            close();
                            resolve({ approved: true });
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
                width: dialogConfig.width,
                maxHeight: dialogConfig.maxHeight,
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
                title: '工具结果审核',
                loader: () => (
                    <ToolResultApprovalUI
                        toolName={toolName}
                        args={args}
                        result={result}
                        onApprove={() => {
                            close();
                            resolve({ approved: true });
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
                width: dialogConfig.width,
                maxHeight: dialogConfig.maxHeight,
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
