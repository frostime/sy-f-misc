/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-07-29 19:47:00
 * @FilePath     : /src/func/gpt/chat/ChatSession/UndoDelete/useUndoDelete.ts
 * @LastEditTime : 2025-07-29 19:47:00
 * @Description  : 撤销删除功能的核心 Hook
 */

import { createSignal, createMemo } from 'solid-js';
import { showMessage } from 'siyuan';
import type { 
    IDeleteOperation, 
    IUndoDeleteHook, 
    IUndoStackConfig, 
    ISessionMethods,
    IVersionDeleteData
} from './types';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: IUndoStackConfig = {
    maxSize: 5
};

/**
 * 生成消息预览文本（用于操作描述）
 */
const getMessagePreview = (messageItem: IChatSessionMsgItem): string => {
    if (!messageItem.message?.content) return '未知消息';
    
    const content = typeof messageItem.message.content === 'string' 
        ? messageItem.message.content 
        : messageItem.message.content[0]?.text || '多媒体消息';
    
    // 截取前30个字符作为预览
    return content.length > 30 ? content.substring(0, 30) + '...' : content;
};

/**
 * 生成版本预览文本
 */
const getVersionPreview = (version: string, versionData: IVersionDeleteData['versionContent']): string => {
    const content = typeof versionData.content === 'string' 
        ? versionData.content 
        : versionData.content[0]?.text || '多媒体内容';
    
    const preview = content.length > 20 ? content.substring(0, 20) + '...' : content;
    return `${version} (${preview})`;
};

/**
 * 撤销删除功能的核心 Hook
 */
export const useUndoDelete = (config: Partial<IUndoStackConfig> = {}): IUndoDeleteHook => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const [undoStack, setUndoStack] = createSignal<IDeleteOperation[]>([]);

    /**
     * 向栈中推入新操作
     */
    const pushToStack = (operation: IDeleteOperation) => {
        setUndoStack(prev => {
            const newStack = [...prev, operation];
            // 保持栈大小不超过限制
            if (newStack.length > finalConfig.maxSize) {
                return newStack.slice(-finalConfig.maxSize);
            }
            return newStack;
        });
    };

    /**
     * 记录消息删除操作
     */
    const recordDeleteMessage = (messageItem: IChatSessionMsgItem, index: number): void => {
        const operation: IDeleteOperation = {
            id: window.Lute.NewNodeID(),
            type: 'message',
            timestamp: Date.now(),
            description: `删除消息: ${getMessagePreview(messageItem)}`,
            messageData: {
                item: JSON.parse(JSON.stringify(messageItem)), // 使用JSON序列化进行深拷贝
                index
            }
        };
        
        pushToStack(operation);
    };

    /**
     * 记录版本删除操作
     */
    const recordDeleteVersion = (
        messageId: string, 
        version: string, 
        versionData: IVersionDeleteData['versionContent'],
        context: {
            wasCurrentVersion: boolean;
            switchedToVersion?: string;
        }
    ): void => {
        const operation: IDeleteOperation = {
            id: window.Lute.NewNodeID(),
            type: 'version',
            timestamp: Date.now(),
            description: `删除版本: ${getVersionPreview(version, versionData)}`,
            versionData: {
                messageId,
                version,
                versionContent: JSON.parse(JSON.stringify(versionData)), // 使用JSON序列化进行深拷贝
                wasCurrentVersion: context.wasCurrentVersion,
                switchedToVersion: context.switchedToVersion
            }
        };
        
        pushToStack(operation);
    };

    /**
     * 撤销最后一个操作
     */
    const undoLastOperation = (sessionMethods: ISessionMethods): boolean => {
        const stack = undoStack();
        if (stack.length === 0) {
            showMessage('没有可撤销的操作');
            return false;
        }

        const operation = stack[stack.length - 1];
        
        try {
            if (operation.type === 'message') {
                // 恢复删除的消息
                const { item, index } = operation.messageData!;
                sessionMethods.messages.update((prev: IChatSessionMsgItem[]) => {
                    const newList = [...prev];
                    // 确保索引有效，如果超出范围则插入到末尾
                    const insertIndex = Math.min(index, newList.length);
                    newList.splice(insertIndex, 0, item);
                    return newList;
                });
                
                showMessage(`已恢复消息: ${getMessagePreview(item)}`);
                
            } else if (operation.type === 'version') {
                // 恢复删除的版本
                const { messageId, version, versionContent, wasCurrentVersion } = operation.versionData!;
                
                // 先恢复版本数据
                sessionMethods.messages.update((prev: IChatSessionMsgItem[]) => 
                    prev.map(item => {
                        if (item.id === messageId) {
                            return {
                                ...item,
                                versions: {
                                    ...item.versions,
                                    [version]: versionContent
                                }
                            };
                        }
                        return item;
                    })
                );
                
                // 如果删除的是当前版本，需要切换回去
                if (wasCurrentVersion) {
                    sessionMethods.switchMsgItemVersion(messageId, version);
                }
                
                showMessage(`已恢复版本: ${version}`);
            }
            
            // 从栈中移除已撤销的操作
            setUndoStack(prev => prev.slice(0, -1));
            return true;
            
        } catch (error) {
            console.error('撤销操作失败:', error);
            showMessage('撤销操作失败，请重试');
            return false;
        }
    };

    /**
     * 清空撤销栈
     */
    const clearUndoStack = (): void => {
        setUndoStack([]);
    };

    // 计算属性
    const canUndo = createMemo(() => undoStack().length > 0);
    const undoCount = createMemo(() => undoStack().length);

    return {
        undoStack,
        canUndo,
        undoCount,
        recordDeleteMessage,
        recordDeleteVersion,
        undoLastOperation,
        clearUndoStack
    };
};
