/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-08-24 16:20:00
 * @FilePath     : /src/func/gpt/chat/ChatSession/DeleteHistory/types.ts
 * @LastEditTime : 2025-08-24 16:20:00
 * @Description  : 删除历史记录功能的简化类型定义
 */

/**
 * 删除操作类型
 */
export type TDeleteType = 'message' | 'version';

/**
 * 删除记录
 */
export interface IDeleteRecord {
    /** 记录唯一标识 */
    id: string;
    /** 删除类型 */
    type: 'message' | 'version';

    // 完整的消息信息（用于记录被删除的完整消息项）
    originalItem?: Partial<IChatSessionMsgItemV2>;

    // 简化的显示信息（用于快速展示）
    content: string;
    author?: string;
    timestamp: number;
    deletedAt: number;
    sessionId: string;
    sessionTitle?: string;

    // 版本相关信息（当删除特定版本时）
    versionId?: string;
    totalVersions?: number;

    // 额外信息（用于向后兼容）
    extra?: any;
}

/**
 * 删除历史管理器接口
 */
export interface IDeleteHistoryManager {
    /** 获取所有删除记录 */
    records: () => IDeleteRecord[];
    /** 添加删除记录 */
    addRecord: (record: Omit<IDeleteRecord, 'id' | 'deletedAt'>) => void;
    /** 清空所有记录 */
    clearRecords: () => void;
    /** 删除单个记录 */
    removeRecord: (recordId: string) => void;
    /** 记录数量 */
    count: () => number;
}
