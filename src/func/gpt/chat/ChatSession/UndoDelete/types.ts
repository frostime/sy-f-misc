/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-07-29 19:47:00
 * @FilePath     : /src/func/gpt/chat/ChatSession/UndoDelete/types.ts
 * @LastEditTime : 2025-07-29 19:47:00
 * @Description  : 撤销删除功能的类型定义
 */

/**
 * 删除操作类型
 */
export type TDeleteOperationType = 'message' | 'version';

/**
 * 消息删除操作的数据
 */
export interface IMessageDeleteData {
    /** 被删除的完整消息项 */
    item: IChatSessionMsgItem;
    /** 消息在列表中的索引位置 */
    index: number;
}

/**
 * 版本删除操作的数据
 */
export interface IVersionDeleteData {
    /** 所属消息的ID */
    messageId: string;
    /** 被删除的版本ID */
    version: string;
    /** 版本的完整内容 */
    versionContent: {
        content: IMessage['content'];
        reasoning_content?: IMessage['reasoning_content'];
        author?: IChatSessionMsgItem['author'];
        timestamp?: IChatSessionMsgItem['timestamp'];
        token?: IChatSessionMsgItem['token'];
        time?: CompletionResponse['time'];
    };
    /** 是否是当前激活版本 */
    wasCurrentVersion: boolean;
    /** 删除后切换到的版本ID（如果有） */
    switchedToVersion?: string;
}

/**
 * 删除操作记录
 */
export interface IDeleteOperation {
    /** 操作唯一标识 */
    id: string;
    /** 操作类型 */
    type: TDeleteOperationType;
    /** 操作时间戳 */
    timestamp: number;
    /** 操作描述（用于UI显示） */
    description: string;
    /** 消息删除数据（当type为'message'时） */
    messageData?: IMessageDeleteData;
    /** 版本删除数据（当type为'version'时） */
    versionData?: IVersionDeleteData;
}

/**
 * 撤销栈配置
 */
export interface IUndoStackConfig {
    /** 最大栈大小 */
    maxSize: number;
}

/**
 * 撤销删除 Hook 的返回类型
 */
export interface IUndoDeleteHook {
    /** 撤销栈 */
    undoStack: () => IDeleteOperation[];
    /** 是否可以撤销 */
    canUndo: () => boolean;
    /** 可撤销操作数量 */
    undoCount: () => number;
    /** 记录消息删除操作 */
    recordDeleteMessage: (messageItem: IChatSessionMsgItem, index: number) => void;
    /** 记录版本删除操作 */
    recordDeleteVersion: (
        messageId: string, 
        version: string, 
        versionData: IVersionDeleteData['versionContent'],
        context: {
            wasCurrentVersion: boolean;
            switchedToVersion?: string;
        }
    ) => void;
    /** 撤销最后一个操作 */
    undoLastOperation: (sessionMethods: ISessionMethods) => boolean;
    /** 清空撤销栈 */
    clearUndoStack: () => void;
}

/**
 * Session 方法接口（用于撤销操作时调用）
 */
export interface ISessionMethods {
    /** 消息列表的更新方法 */
    messages: {
        update: (updater: (prev: IChatSessionMsgItem[]) => IChatSessionMsgItem[]) => void;
    };
    /** 切换消息版本方法 */
    switchMsgItemVersion: (itemId: string, version: string) => void;
}
