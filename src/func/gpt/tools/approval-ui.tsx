/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-15 16:30:14
 * @FilePath     : /src/func/gpt/tools/approval-ui.tsx
 * @Description  : 工具审核 UI 组件和适配器
 */
import { Component, JSX, Match, Show, Switch } from "solid-js";
import { ToolExecuteResult, ApprovalUIAdapter, ToolPermission, ToolPermissionLevel } from "./types";
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
            <h3 style={{ "margin": "12px 0 8px 0", "font-size": "14px" }}>参数:</h3>
            <ul class="b3-list" style={{
                "margin": "0",
                "padding": "0 0 0 20px",
                "overflow": "hidden"
            }}>
                {Object.keys(props.args).map(key => (
                    <li style={{
                        "margin-bottom": "8px",
                        "word-break": "break-all",
                        "overflow-wrap": "anywhere"
                    }}>
                        <strong style={{ "color": "var(--b3-theme-on-background)" }}>{key}:</strong>{' '}
                        {
                            typeof props.args[key] === 'string' && (props.args[key].includes('\n') || props.args[key].length > 100) ? (
                                <textarea
                                    class="b3-text-field"
                                    readOnly
                                    value={props.args[key]}
                                    rows={rows(props.args[key])}
                                    style={{
                                        "width": "100%",
                                        "margin": "4px 0",
                                        "resize": "vertical",
                                        "font-family": "var(--b3-font-family-code)",
                                        "font-size": "13px",
                                        "box-sizing": "border-box",
                                        "border-radius": "var(--radius-sm)"
                                    }}
                                />
                            ) : (
                                <code style={{
                                    "word-break": "break-all",
                                    "overflow-wrap": "anywhere",
                                    "white-space": "pre-wrap",
                                    "display": "inline",
                                    "font-size": "13px",
                                    "background": "var(--b3-theme-surface-lighter)",
                                    "padding": "2px 6px",
                                    "border-radius": "4px"
                                }}>
                                    {JSON.stringify(props.args[key])}
                                </code>
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

    const descriptionShort = props.description && props.description.length > 200
        ? props.description.slice(0, 200) + '...'
        : props.description;

    return (
        <div style={{
            "padding": "16px 20px",
            "width": "100%",
            "box-sizing": "border-box",
            "overflow": "hidden",
        }}>
            <div class="b3-typography" style={{
                "margin": "0 0 12px 0",
                "overflow": "hidden"
            }}>
                <h3 style={{
                    "margin": "0 0 8px 0",
                    "font-size": "15px",
                    "font-weight": "600",
                    "word-break": "break-all",
                    "color": "var(--b3-theme-on-background)"
                }}>
                    {props.title}
                </h3>
                {props.description && (
                    <p style={{
                        "margin": "0 0 12px 0",
                        "font-size": "13px",
                        "color": "var(--b3-theme-on-background-light)",
                        "word-break": "break-word",
                        "line-height": "1.5"
                    }}>
                        {descriptionShort}
                    </p>
                )}
                {props.children}
            </div>

            <div style={{
                "display": "flex",
                "align-items": "center",
                "gap": "8px",
                "flex-wrap": "wrap",
                "margin-top": "16px",
                "padding-top": "12px",
                "border-top": "1px solid var(--b3-border-color)"
            }}>
                {props.extraButtons}

                {props.showReasonInput && (
                    <input
                        type="text"
                        class="b3-text-field"
                        placeholder="可选的拒绝理由"
                        value={reason()}
                        onInput={(e) => reason(e.currentTarget.value)}
                        style={{
                            "width": "unset",
                            "max-width": "unset",
                            "flex": "1",
                            "min-width": "150px",
                            "display": "inline-block",
                            "border-radius": "var(--radius-sm)"
                        }}
                    />
                )}

                {!props.showReasonInput && !props.extraButtons && (
                    <div style={{ "flex": "1" }} />
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
                        "opacity": decided() ? "0.5" : "1",
                        "pointer-events": decided() ? "none" : "auto",
                        "flex-shrink": "0",
                        "border-radius": "var(--radius-sm)",
                        "transition": "all var(--transition-fast)"
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
                        "background-color": "var(--b3-theme-primary)",
                        "opacity": decided() ? "0.5" : "1",
                        "pointer-events": decided() ? "none" : "auto",
                        "flex-shrink": "0",
                        "border-radius": "var(--radius-sm)",
                        "transition": "all var(--transition-fast)"
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
    toolDefinition?: IToolDefinition & ToolPermission;
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

    // ✅ 修复：放宽显示条件，MODERATE 及以上都显示
    const SafetyReviewButton = () => {
        const shouldShowButton = () => {
            if (!props.toolDefinition) return false;
            const level = getEffectivePermissionLevel();
            return level === ToolPermissionLevel.SENSITIVE ||
                   level === ToolPermissionLevel.MODERATE;
        };

        return (
            <Show when={shouldShowButton()}>
                <ButtonInput
                    label={isReviewing() ? "审查中..." : "🛡️ AI安全审查"}
                    onClick={handleSafetyReview}
                    disabled={isReviewing()}
                    style={{
                        "opacity": isReviewing() ? "0.5" : "1",
                        "background-color": "var(--b3-theme-secondary)",
                        "flex-shrink": "0",
                        "border-radius": "var(--radius-sm)",
                        "transition": "all var(--transition-fast)"
                    }}
                />
            </Show>
        );
    };

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
                    "margin-top": "16px",
                    "padding": "12px 16px",
                    "background-color": "var(--b3-theme-surface-light)",
                    "border-radius": "var(--radius-md)",
                    "border": "1px solid var(--b3-border-color)"
                }}>
                    <h4 style={{
                        "margin": "0 0 8px 0",
                        "font-size": "14px",
                        "font-weight": "600",
                        "color": "var(--b3-theme-on-surface)"
                    }}>
                        🛡️ AI 安全审查结果
                    </h4>
                    <div class="b3-typography" style={{
                        "white-space": "pre-wrap",
                        "font-size": "13px",
                        "line-height": "1.6"
                    }}>
                        <Markdown markdown={safetyReviewResult() ?? ""} />
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

    let dataContent = props.result.finalText ??
        (typeof props.result.data === 'string' ? props.result.data : JSON.stringify(props.result.data));

    return (
        <BaseApprovalUI
            title={`允许将工具 ${props.toolName} 的结果发送给 LLM？`}
            onApprove={props.onApprove}
            onReject={props.onReject}
            showReasonInput={true}
        >
            <ArgsListComponent args={props.args} />

            <h3 style={{
                "margin": "12px 0 8px 0",
                "font-size": "14px",
                "font-weight": "600"
            }}>
                结果 (共 {dataContent.length} 字符)
            </h3>
            <textarea
                class="b3-text-field"
                style={{
                    "width": "100%",
                    "margin": "8px 0",
                    "resize": "vertical",
                    "font-family": "var(--b3-font-family-code)",
                    "font-size": "13px",
                    "border-radius": "var(--radius-sm)"
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
    width: '680px',
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
        toolDefinition?: IToolDefinition & ToolPermission
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

// ============================================================================
// 内联审批适配器（嵌入消息流）
// ============================================================================

import { IStoreRef } from '@frostime/solid-signal-ref';
import type { PendingApproval } from './types';

/**
 * 内联审批 UI 适配器
 * 将审批请求加入队列，由 Chat 主界面渲染
 */
export class InlineApprovalAdapter implements ApprovalUIAdapter {
    constructor(
        private pendingApprovals: IStoreRef<PendingApproval[]>,
        private generateId: () => string
    ) { }

    async showToolExecutionApproval(
        toolName: string,
        toolDescription: string,
        args: Record<string, any>,
        toolDefinition?: IToolDefinition & ToolPermission
    ): Promise<{
        approved: boolean;
        persistDecision?: boolean;
        rejectReason?: string;
    }> {
        return new Promise((resolve) => {
            const approval: PendingApproval = {
                id: this.generateId(),
                type: 'execution',
                toolName,
                toolDescription,
                toolDefinition,
                args,
                createdAt: Date.now(),
                resolve
            };
            this.pendingApprovals.update(prev => [...prev, approval]);
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
            const approval: PendingApproval = {
                id: this.generateId(),
                type: 'result',
                toolName,
                args,
                result,
                createdAt: Date.now(),
                resolve
            };
            this.pendingApprovals.update(prev => [...prev, approval]);
        });
    }
}

// ============================================================================
// 内联审批卡片组件
// ============================================================================

/**
 * 内联审批卡片 - 嵌入消息流中显示
 */
export const InlineApprovalCard: Component<{
    approval: PendingApproval;
    onApprove: () => void;
    onReject: (reason?: string) => void;
}> = (props) => {
    return (
        <div style={{
            "margin": "16px 0",
            "padding": "0",
            "border": "1px solid var(--b3-theme-primary-lighter)",
            "border-radius": "var(--radius-md)",
            "background": "var(--b3-theme-background)",
            "box-shadow": "0 1px 3px rgba(0,0,0,0.06)",
            "overflow": "hidden",
            "max-width": "100%",
            "box-sizing": "border-box"
        }}>
            <Switch>
                <Match when={props.approval.type === 'execution'}>
                    <ToolExecutionApprovalUI
                        toolName={props.approval.toolName}
                        toolDescription={props.approval.toolDescription || ''}
                        toolDefinition={props.approval.toolDefinition}
                        args={props.approval.args}
                        onApprove={props.onApprove}
                        onReject={props.onReject}
                    />
                </Match>
                <Match when={props.approval.type === 'result'}>
                    <ToolResultApprovalUI
                        toolName={props.approval.toolName}
                        args={props.approval.args}
                        result={props.approval.result!}
                        onApprove={props.onApprove}
                        onReject={props.onReject}
                    />
                </Match>
            </Switch>
        </div>
    );
};
