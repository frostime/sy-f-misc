/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-15 16:30:14
 * @FilePath     : /src/func/gpt/tools/approval-ui.tsx
 * @Description  : 工具审核 UI 组件和适配器
 */
import { Component, JSX, Show } from "solid-js";
import { ToolExecuteResult, ApprovalUIAdapter, ToolDefinitionWithPermission, ToolPermissionLevel } from "./types";
import { ButtonInput } from "@/libs/components/Elements";
import { solidDialog } from "@/libs/dialog";
import { createSignalRef } from "@frostime/solid-signal-ref";
import { toolCallSafetyReview } from "./utils";
import { toolsManager } from "../model/store";
import Markdown from "@/libs/components/Elements/Markdown";

/**
 * 渲染参数列表组件
 */
const ArgsListComponent = (props: { args: Record<string, any> }) => {
    const rows = (text: string) => {
        return Math.max(Math.min(text.split('\n').length, 20), 5);
    }
    return (
        <>
            <h3>参数:</h3>
            <ul class="b3-list">
                {Object.keys(props.args).map(key => (
                    <li>
                        <strong>{key}:</strong> {
                            typeof props.args[key] === 'string' && (props.args[key].includes('\n') || props.args[key].length > 100) ? (
                                <textarea
                                    class="b3-text-field"
                                    readOnly
                                    value={props.args[key]}
                                    rows={rows(props.args[key])}
                                    style={{
                                        "width": "100%",
                                        "margin": "8px 0",
                                        "resize": "vertical",
                                        "font-family": "var(--b3-font-family-code)"
                                    }}
                                />
                            ) : (
                                <code>{JSON.stringify(props.args[key])}</code>
                            )
                        }
                    </li>
                ))}
            </ul>
        </>
    );
};


const BaseApprovalUI = (props: {
    title: string;
    description?: string;
    onApprove: () => void;
    onReject: (reason?: string) => void;
    showReasonInput?: boolean;
    children?: JSX.Element;
    extraButtons?: JSX.Element;
}) => {
    const reason = createSignalRef('');

    let decided = createSignalRef(false);

    const descriptionShort = props.description && props.description.length > 200 ? props.description.slice(0, 200) + '...' : props.description;

    return (
        <div style={{
            "padding": "16px",
            "width": "100%"
        }}>

            <div class="b3-typography" style={{
                "margin": "8px 0"
            }}>
                <h3>{props.title}</h3>
                {props.description && <p><strong>{descriptionShort}</strong></p>}

                {props.children}
            </div>


            <div style={{
                "display": "flex",
                "align-content": "center",
                "gap": "8px"
            }}>
                {props.extraButtons}

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

                {!props.showReasonInput && !props.extraButtons && (
                    <div style={{
                        "flex": 1
                    }} />
                )}

                <ButtonInput
                    label="拒绝"
                    onClick={() => {
                        if (decided()) return;
                        decided(true);
                        props.onReject(props.showReasonInput ? reason() : undefined);
                    }}
                    style={{
                        "background-color": "var(--b3-theme-error)",
                        "font-size": "12px",
                        "opacity": decided() ? "0.6" : "1",
                        "pointer-events": decided() ? "none" : "auto"
                    }}
                />
                <ButtonInput
                    label="允许"
                    onClick={() => {
                        if (decided()) return;
                        decided(true);
                        props.onApprove()
                    }}
                    style={{
                        "font-size": "12px",
                        "opacity": decided() ? "0.6" : "1",
                        "pointer-events": decided() ? "none" : "auto"
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
    toolDefinition?: ToolDefinitionWithPermission;
    args: Record<string, any>;
    onApprove: () => void;
    onReject: (reason?: string) => void;
}> = (props) => {
    const safetyReviewResult = createSignalRef<string | null>(null);
    const isReviewing = createSignalRef(false);

    // 获取有效的权限级别（考虑用户覆盖配置）
    const getEffectivePermissionLevel = (): ToolPermissionLevel | undefined => {
        const toolName = props.toolDefinition?.function?.name;
        if (!toolName) return props.toolDefinition?.permissionLevel;

        const override = toolsManager().toolPermissionOverrides[toolName];
        if (override?.permissionLevel) {
            switch (override.permissionLevel) {
                case 'public': return ToolPermissionLevel.PUBLIC;
                case 'moderate': return ToolPermissionLevel.MODERATE;
                case 'sensitive': return ToolPermissionLevel.SENSITIVE;
            }
        }
        return props.toolDefinition?.permissionLevel;
    };

    const isSensitiveTool = () => getEffectivePermissionLevel() === ToolPermissionLevel.SENSITIVE;

    const handleSafetyReview = async () => {
        if (!props.toolDefinition || isReviewing()) return;
        isReviewing(true);
        safetyReviewResult(null);
        try {
            const result = await toolCallSafetyReview(props.toolDefinition, props.args);
            safetyReviewResult(result);
        } catch (e) {
            safetyReviewResult(`安全审查失败: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            isReviewing(false);
        }
    };

    const SafetyReviewButton = () => (
        <Show when={isSensitiveTool() && props.toolDefinition}>
            <ButtonInput
                label={isReviewing() ? "审查中..." : "AI安全审查"}
                onClick={handleSafetyReview}
                style={{
                    "font-size": "12px",
                    "opacity": isReviewing() ? "0.6" : "1",
                    "pointer-events": isReviewing() ? "none" : "auto",
                    "background-color": "var(--b3-theme-secondary)"
                }}
            />
            {/* <div style={{ "flex": 1 }} /> */}
        </Show>
    );

    return (
        <BaseApprovalUI
            title={`允许执行工具 ${props.toolName}？`}
            description={props.toolDescription}
            onApprove={props.onApprove}
            onReject={props.onReject}
            showReasonInput={true}
            extraButtons={<SafetyReviewButton />}
        >
            <ArgsListComponent args={props.args} />

            <Show when={safetyReviewResult()}>
                <div style={{
                    "margin-top": "12px",
                    "padding": "12px",
                    "background-color": "var(--b3-theme-surface)",
                    "border-radius": "4px",
                    "border": "1px solid var(--b3-border-color)"
                }}>
                    <h4 style={{ "margin": "0 0 8px 0" }}>🛡️ AI 安全审查结果</h4>
                    <div class="b3-typography" style={{ "white-space": "pre-wrap", "font-size": "13px" }}>
                        <Markdown markdown={safetyReviewResult() ?? ""}/>
                    </div>
                </div>
            </Show>
        </BaseApprovalUI>
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
    onReject: (reason?: string) => void;
}> = (props) => {

    // const dataContent = instanceof(props.result.data, string) ? props.result.data : JSON.stringify(props.result.data);
    // let dataContent = props.result.finalText;
    let dataContent = props.result.finalText ??
        (typeof props.result.data === 'string' ? props.result.data : JSON.stringify(props.result.data));
    // if (typeof props.result.data === 'string') {
    //     dataContent = props.result.data;
    // } else {
    //     dataContent = JSON.stringify(props.result.data);
    // }

    return (
        <BaseApprovalUI
            title={`允许将工具 ${props.toolName} 的结果发送给 LLM？`}
            onApprove={props.onApprove}
            onReject={props.onReject}
            showReasonInput={true}
        >
            <ArgsListComponent args={props.args} />

            <h3>结果 (共 {dataContent.length} 字符)</h3>
            <textarea
                class="b3-text-field"
                style={{
                    "width": "100%",
                    // "height": "120px",
                    "margin": "8px 0",
                    "resize": "vertical",
                    "font-family": "var(--b3-font-family-code)"
                }}
                rows={10}
                readOnly
                value={dataContent}
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
        args: Record<string, any>,
        toolDefinition?: ToolDefinitionWithPermission
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
                        toolDefinition={toolDefinition}
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
                        onReject={(reason?: string) => {
                            close();
                            resolve({
                                approved: false,
                                rejectReason: reason?.trim() || '用户拒绝发送结果'
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
