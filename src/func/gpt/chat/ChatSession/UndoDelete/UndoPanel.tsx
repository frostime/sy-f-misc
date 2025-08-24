/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-07-29 19:47:00
 * @FilePath     : /src/func/gpt/chat/ChatSession/UndoDelete/UndoPanel.tsx
 * @LastEditTime : 2025-07-29 19:47:00
 * @Description  : 撤销删除面板组件
 */

import { Component, For, Show } from 'solid-js';
import type { IDeleteOperation, ISessionMethods } from './types';

interface IUndoPanelProps {
    /** 撤销栈数据 */
    undoStack: IDeleteOperation[];
    /** 撤销操作回调 */
    onUndo: (sessionMethods: ISessionMethods) => boolean;
    /** 关闭面板回调 */
    onClose: () => void;
    /** Session 方法（用于撤销操作） */
    sessionMethods: ISessionMethods;
}

/**
 * 获取操作类型的图标
 */
const getOperationIcon = (type: IDeleteOperation['type']): string => {
    switch (type) {
        case 'message':
            return 'iconTrashcan';
        case 'version':
            return 'iconClose';
        default:
            return 'iconUndo';
    }
};

/**
 * 撤销删除面板组件
 */
const UndoPanel: Component<IUndoPanelProps> = (props) => {
    const handleUndo = () => {
        const success = props.onUndo(props.sessionMethods);
        if (success && props.undoStack.length <= 1) {
            // 如果撤销后栈为空，自动关闭面板
            props.onClose();
        }
    };

    return (
        <div class="b3-dialog b3-dialog--open" style={{ "z-index": "310" }}>
            <div class="b3-dialog__scrim" onClick={props.onClose}></div>
            <div class="b3-dialog__container" style={{ 
                "width": "400px", 
                "max-height": "500px",
                "position": "fixed",
                "top": "50%",
                "left": "50%",
                "transform": "translate(-50%, -50%)"
            }}>
                <div class="b3-dialog__header">
                    <div class="b3-dialog__title">撤销删除</div>
                    <button 
                        class="b3-dialog__close" 
                        onClick={props.onClose}
                        aria-label="关闭"
                    >
                        <svg class="b3-dialog__close-icon">
                            <use href="#iconClose"></use>
                        </svg>
                    </button>
                </div>
                
                <div class="b3-dialog__body" style={{ 
                    "max-height": "400px", 
                    "overflow-y": "auto",
                    padding: "16px"
                }}>
                    <Show 
                        when={props.undoStack.length > 0}
                        fallback={
                            <div style={{ 
                                "text-align": "center", 
                                color: "var(--b3-theme-on-surface-light)",
                                padding: "32px 16px"
                            }}>
                                <div style={{ "font-size": "48px", "margin-bottom": "16px" }}>
                                    <svg style={{ width: "48px", height: "48px" }}>
                                        <use href="#iconUndo"></use>
                                    </svg>
                                </div>
                                <div>暂无可撤销的操作</div>
                            </div>
                        }
                    >
                        <div style={{ "margin-bottom": "16px" }}>
                            <div style={{ 
                                color: "var(--b3-theme-on-surface-light)",
                                "font-size": "14px"
                            }}>
                                按时间倒序显示，点击"撤销"恢复最近的删除操作
                            </div>
                        </div>
                        
                        <div class="b3-list b3-list--background">
                            <For each={[...props.undoStack].reverse()}>
                                {(operation, index) => (
                                    <div 
                                        class="b3-list-item"
                                        classList={{
                                            "b3-list-item--focus": index() === 0
                                        }}
                                        style={{
                                            padding: "12px 16px",
                                            border: index() === 0 ? "1px solid var(--b3-theme-primary)" : "none",
                                            "border-radius": index() === 0 ? "4px" : "0",
                                            "background-color": index() === 0 ? "var(--b3-theme-primary-lightest)" : "transparent"
                                        }}
                                    >
                                        <div style={{ 
                                            display: "flex", 
                                            "align-items": "center",
                                            gap: "12px"
                                        }}>
                                            <div style={{ 
                                                "flex-shrink": "0",
                                                color: "var(--b3-theme-on-surface-light)"
                                            }}>
                                                <svg style={{ width: "16px", height: "16px" }}>
                                                    <use href={`#${getOperationIcon(operation.type)}`}></use>
                                                </svg>
                                            </div>
                                            
                                            <div style={{ "flex-grow": "1", "min-width": "0" }}>
                                                <div style={{ 
                                                    "font-weight": index() === 0 ? "500" : "normal",
                                                    "margin-bottom": "4px",
                                                    "word-break": "break-word"
                                                }}>
                                                    {operation.description}
                                                </div>
                                                <div style={{ 
                                                    "font-size": "12px",
                                                    color: "var(--b3-theme-on-surface-light)"
                                                }}>
                                                    {new Date(operation.timestamp).toLocaleString()}
                                                </div>
                                            </div>
                                            
                                            <Show when={index() === 0}>
                                                <div style={{ "flex-shrink": "0" }}>
                                                    <span style={{
                                                        "font-size": "12px",
                                                        color: "var(--b3-theme-primary)",
                                                        "font-weight": "500"
                                                    }}>
                                                        下一个撤销
                                                    </span>
                                                </div>
                                            </Show>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>
                </div>
                
                <div class="b3-dialog__action" style={{ 
                    padding: "16px",
                    "border-top": "1px solid var(--b3-theme-surface-lighter)"
                }}>
                    <button 
                        class="b3-button b3-button--cancel"
                        onClick={props.onClose}
                    >
                        关闭
                    </button>
                    <button 
                        class="b3-button b3-button--text"
                        disabled={props.undoStack.length === 0}
                        onClick={handleUndo}
                        style={{
                            "margin-left": "8px"
                        }}
                    >
                        <svg style={{ width: "14px", height: "14px", "margin-right": "4px" }}>
                            <use href="#iconUndo"></use>
                        </svg>
                        撤销 ({props.undoStack.length})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UndoPanel;
