/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-15 16:30:14
 * @FilePath     : /src/func/gpt/tools/approval-ui.tsx
 * @Description  : 工具审核 UI 组件和适配器
 */
import { Component, createSignal, createMemo } from "solid-js";
import { render } from "solid-js/web";
import { ToolExecuteResult, ToolPermissionLevel, ApprovalUIAdapter, DisplayMode } from "./types";
import { ButtonInput } from "@/libs/components/Elements";
import CheckboxInput from "@/libs/components/Elements/CheckboxInput";
import { solidDialog } from "@/libs/dialog";

/**
 * 工具执行审核组件
 */
export const ToolExecutionApprovalUI: Component<{
    toolName: string;
    toolDescription: string;
    args: Record<string, any>;
    canRemember: boolean;
    onApprove: (remember: boolean) => void;
    onReject: () => void;
    displayMode: DisplayMode;
}> = (props) => {
    const [remember, setRemember] = createSignal(false);

    const containerStyle = createMemo(() =>
        props.displayMode === DisplayMode.INLINE
            ? {
                "padding": "16px",
                "margin": "8px 0",
                "border": "1px solid var(--b3-border-color)",
                "border-radius": "4px"
            }
            : {
                "padding": "16px",
                "max-width": "500px"
            }
    );

    return (
        <div style={containerStyle()}>
            <h3 style={{
                "font-size": props.displayMode === DisplayMode.INLINE ? "18px" : "16px",
                "font-weight": "bold",
                "margin-bottom": "8px"
            }}>
                允许执行工具 {props.toolName}？
            </h3>
            <div style={{ "margin-bottom": "16px" }}>
                <p style={{ "margin-bottom": "8px" }}>
                    <strong>描述:</strong> {props.toolDescription}
                </p>
                <p style={{ "margin-bottom": "8px" }}>
                    <strong>参数:</strong>
                </p>
                <pre style={{
                    "background-color": "#f5f5f5",
                    "padding": "8px",
                    "border-radius": "4px",
                    "max-height": props.displayMode === DisplayMode.INLINE ? "200px" : "150px",
                    "overflow": "auto",
                    "font-size": props.displayMode === DisplayMode.INLINE ? "14px" : "12px"
                }}>
                    {JSON.stringify(props.args, null, 2)}
                </pre>
            </div>

            {props.canRemember && (
                <div style={{ "margin-bottom": "16px" }}>
                    <CheckboxInput
                        checked={remember()}
                        changed={setRemember}
                    />
                    <span style={{ "margin-left": "8px" }}>记住我的决定</span>
                </div>
            )}

            <div style={{
                "display": "flex",
                "justify-content": "flex-end",
                "gap": "8px"
            }}>
                <ButtonInput
                    label="拒绝"
                    onClick={props.onReject}
                    style={{
                        "background-color": "#f44336",
                        "color": "white",
                        "font-size": props.displayMode === DisplayMode.INLINE ? "14px" : "12px"
                    }}
                />
                <ButtonInput
                    label="允许"
                    onClick={() => props.onApprove(remember())}
                    style={{
                        "background-color": "#4caf50",
                        "color": "white",
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
    const containerStyle = createMemo(() =>
        props.displayMode === DisplayMode.INLINE
            ? {
                "padding": "16px",
                "margin": "8px 0",
                "border": "1px solid var(--b3-border-color)",
                "border-radius": "4px"
            }
            : {
                "padding": "16px",
                "max-width": "500px"
            }
    );

    return (
        <div style={containerStyle()}>
            <h3 style={{
                "font-size": props.displayMode === DisplayMode.INLINE ? "18px" : "16px",
                "font-weight": "bold",
                "margin-bottom": "8px"
            }}>
                允许将工具 {props.toolName} 的结果发送给 LLM？
            </h3>
            <div style={{ "margin-bottom": "16px" }}>
                <p style={{ "margin-bottom": "8px" }}>
                    <strong>参数:</strong>
                </p>
                <pre style={{
                    "background-color": "#f5f5f5",
                    "padding": "8px",
                    "border-radius": "4px",
                    "max-height": props.displayMode === DisplayMode.INLINE ? "100px" : "80px",
                    "overflow": "auto",
                    "font-size": props.displayMode === DisplayMode.INLINE ? "14px" : "12px"
                }}>
                    {JSON.stringify(props.args, null, 2)}
                </pre>

                <p style={{ "margin-bottom": "8px", "margin-top": "16px" }}>
                    <strong>结果:</strong>
                </p>
                <pre style={{
                    "background-color": "#f5f5f5",
                    "padding": "8px",
                    "border-radius": "4px",
                    "max-height": props.displayMode === DisplayMode.INLINE ? "200px" : "150px",
                    "overflow": "auto",
                    "font-size": props.displayMode === DisplayMode.INLINE ? "14px" : "12px"
                }}>
                    {JSON.stringify(props.result.data, null, 2)}
                </pre>
            </div>

            <div style={{
                "display": "flex",
                "justify-content": "flex-end",
                "gap": "8px"
            }}>
                <ButtonInput
                    label="拒绝"
                    onClick={props.onReject}
                    style={{
                        "background-color": "#f44336",
                        "color": "white",
                        "font-size": props.displayMode === DisplayMode.INLINE ? "14px" : "12px"
                    }}
                />
                <ButtonInput
                    label="允许"
                    onClick={props.onApprove}
                    style={{
                        "background-color": "#4caf50",
                        "color": "white",
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
        args: Record<string, any>,
        permissionLevel: ToolPermissionLevel
    ): Promise<{
        approved: boolean;
        persistDecision?: boolean;
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
                        canRemember={permissionLevel === ToolPermissionLevel.MODERATE}
                        displayMode={DisplayMode.DIALOG}
                        onApprove={(remember) => {
                            close();
                            resolve({
                                approved: true,
                                persistDecision: remember
                            });
                        }}
                        onReject={() => {
                            close();
                            resolve({
                                approved: false,
                                rejectReason: '用户拒绝执行工具'
                            });
                        }}
                    />
                ),
                width: '500px',
                height: 'auto',
                callback: () => {
                    resolve({
                        approved: false,
                        rejectReason: '用户关闭了审核对话框'
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
                width: '500px',
                height: 'auto',
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
