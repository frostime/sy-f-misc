/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-09
 * @FilePath     : /src/func/quick-input-template/types.ts
 * @Description  : Quick Input Template 类型定义
 */

/**
 * 插入位置类型
 */
export type InputPlace = 'block' | 'document' | 'dailynote';

/**
 * 标量类型（用于枚举）
 */
export type ScalarType = string | number | boolean;

/**
 * 插入位置锚定点（计算后的结果）
 */
export type InsertToAnchor = {
    block: {
        anchor: Block;
    };
    document: {
        notebook: NotebookId;
        hpath: string;
    };
    dailynote: {
        notebook: NotebookId;
    };
};

/**
 * 插入位置模板（用户配置）
 */
export type InsertToTemplate = {
    /**
     * Block 插入模式
     */
    block: {
        /** 锚点生成器 */
        anchorGenerator?: {
            type: 'sql' | 'js';
            searchCode: string; // SQL 查询语句或 JS 代码，返回 Block 或 Promise<Block>
        };
        /** 锚点使用方式 */
        anchorUsage:
            | {
                  type: 'parent';
                  insert: 'prepend' | 'append'; // 作为容器使用
              }
            | {
                  type: 'sibling';
                  insert: 'previous' | 'next'; // 作为同级块使用
              };
    };

    /**
     * Document 插入模式（创建新文档或在现有文档操作）
     */
    document: {
        anchorGenerator:
            | {
                  type: 'hpath';
                  notebook: NotebookId;
                  hpathTemplate: string; // 支持模板变量的 hpath
              }
            | {
                  type: 'search';
                  searchType: 'sql' | 'js';
                  searchCode: string; // 返回 Block (文档块)
              };
    };

    /**
     * Dailynote 插入模式（插入到日记）
     */
    dailynote: {
        notebook: NotebookId;
        insert: 'prepend' | 'append';
    };
};

/**
 * 用户输入变量定义
 */
export interface IDeclaredInputVar {
    [key: string]: {
        type: 'text' | 'number' | 'enum' | 'bool';
        label?: string; // 显示标签
        description?: string; // 字段描述
        default?: any; // 默认值
        number?: {
            min?: number;
            max?: number;
            step?: number;
        };
        enum?: ScalarType[]; // 枚举值列表
    };
}

/**
 * 新输入模板配置
 */
export interface INewInputTemplate<T extends InputPlace = InputPlace> {
    /** 模板唯一标识 */
    id: string;

    /** 模板名称 */
    name: string;

    /** 模板描述 */
    desc?: string;

    /** 图标（可选） */
    icon?: string;

    /** 分组名称 */
    group?: string;

    /** 插入类型 */
    newtype: T;

    /** 插入位置配置 */
    insertTo: InsertToTemplate[T];

    /** 内容模板（Markdown 格式） */
    template?: string;

    /** 用户输入变量定义 */
    declaredInputVar?: IDeclaredInputVar;

    /**
     * 前置脚本（在渲染模板之前执行）
     * 注入变量：ctx (ITemplateVar 类型)
     * 返回值：Record<string, any>，会合并到 ctx 中
     *
     * 示例：
     * ```js
     * // 计算本月编辑文档数量
     * const query = `SELECT COUNT(*) as count FROM blocks WHERE type='d' AND updated LIKE '${ctx.year}${ctx.month}%'`;
     * const result = await window.siyuan.sql(query);
     * return { count: result[0].count };
     * ```
     */
    preExecuteScript?: string;

    /**
     * 后置脚本（在插入内容之后执行）
     * 注入变量：ctx (ITemplateVar 类型), content (渲染后的内容), blockId (插入块的 ID)
     *
     * 示例：
     * ```js
     * // 为插入的块设置属性
     * await window.siyuan.setBlockAttrs(blockId, { 'custom-type': 'auto-generated' });
     * ```
     */
    postExecuteScript?: string;

    /** 是否在插入后打开编辑位置（默认 true） */
    openBlock?: boolean;

    /** 创建时间 */
    createdAt?: number;

    /** 更新时间 */
    updatedAt?: number;
}

/**
 * 基础变量（时间相关）
 */
export interface IBasicVar {
    year: number; // 年份，如 2026
    month: number; // 月份 1-12
    day: number; // 日期 1-31
    hour: number; // 小时 0-23
    minute: number; // 分钟 0-59
    second: number; // 秒 0-59
    yearStr: string; // 年份字符串，如 "2026"
    monthStr: string; // 月份字符串（补零），如 "01"
    dayStr: string; // 日期字符串（补零），如 "09"
    hourStr: string; // 小时字符串（补零）
    minuteStr: string; // 分钟字符串（补零）
    secondStr: string; // 秒字符串（补零）
    date: string; // 日期格式 YYYY-MM-DD
    time: string; // 时间格式 HH:mm:ss
    datetime: string; // 日期时间格式 YYYY-MM-DD HH:mm:ss
}

/**
 * 中间变量（基础变量 + 用户输入）
 */
export interface IMidVar extends IBasicVar {
    [key: string]: any; // 用户输入的动态字段
}

/**
 * 模板变量（完整上下文）
 */
export interface ITemplateVar extends IMidVar {
    /** 所在的文档 Block 对象 */
    root: Block;

    /** 锚点 Block 对象 */
    anchor: Block;

    /** 额外的动态计算字段（来自 preExecuteScript） */
    [key: string]: any;
}

/**
 * 模板分组
 */
export interface TemplateGroup {
    /** 分组名称 */
    name: string;

    /** 分组图标 */
    icon?: string;

    /** 排序顺序 */
    order: number;
}

/**
 * 模板存储结构
 */
export interface TemplateStorage {
    /** 模板映射 (id -> template) */
    templates: Record<string, INewInputTemplate<any>>;

    /** 分组列表 */
    groups: TemplateGroup[];

    /** 设置 */
    settings: {
        /** 默认分组 */
        defaultGroup?: string;

        /** 对话框中是否显示分组 */
        showGroupsInDialog?: boolean;
    };
}
