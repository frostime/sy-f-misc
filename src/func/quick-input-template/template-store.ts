/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-09
 * @FilePath     : /src/func/quick-input-template/template-store.ts
 * @Description  : 模板配置存储管理
 */

import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { INewInputTemplate, TemplateStorage, TemplateGroup } from "./types";
import { showMessage } from "siyuan";

const STORAGE_KEY = 'quick-input-templates.json';

/**
 * 生成唯一 ID
 */
function generateId(): string {
    return `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 模板存储类
 */
export class TemplateStore {
    public storage: TemplateStorage;

    constructor() {
        this.storage = {
            templates: {},
            groups: [
                { name: '默认', icon: '📝', order: 0 },
                { name: '开发', icon: '💻', order: 1 },
                { name: '日常', icon: '📅', order: 2 }
            ],
            settings: {
                defaultGroup: '默认',
                showGroupsInDialog: true
            }
        };
    }

    /**
     * 从 plugin data 加载配置
     */
    async load(): Promise<void> {
        try {
            const data = await thisPlugin().loadData(STORAGE_KEY);
            if (data) {
                this.storage = { ...this.storage, ...data };
            } else {
                // 首次加载，创建默认示例模板
                await this.createDefaultTemplates();
                await this.save();
            }
        } catch (error) {
            console.error('[QuickInputTemplate] Failed to load templates:', error);
            showMessage('加载模板配置失败', 3000, 'error');
        }
    }

    /**
     * 保存配置到 plugin data
     */
    async save(): Promise<void> {
        try {
            await thisPlugin().saveData(STORAGE_KEY, this.storage);
        } catch (error) {
            console.error('[QuickInputTemplate] Failed to save templates:', error);
            showMessage('保存模板配置失败', 3000, 'error');
        }
    }

    /**
     * 添加模板
     */
    add(template: Omit<INewInputTemplate, 'id' | 'createdAt' | 'updatedAt'>): string {
        const id = generateId();
        const now = Date.now();
        const newTemplate: INewInputTemplate = {
            ...template,
            id,
            createdAt: now,
            updatedAt: now,
            group: template.group || this.storage.settings.defaultGroup || '默认'
        } as INewInputTemplate;

        this.storage.templates[id] = newTemplate;
        return id;
    }

    /**
     * 更新模板
     */
    update(id: string, template: Partial<INewInputTemplate>): boolean {
        if (!this.storage.templates[id]) {
            return false;
        }

        this.storage.templates[id] = {
            ...this.storage.templates[id],
            ...template,
            id, // 保持 ID 不变
            updatedAt: Date.now()
        };
        return true;
    }

    /**
     * 删除模板
     */
    delete(id: string): boolean {
        if (!this.storage.templates[id]) {
            return false;
        }
        delete this.storage.templates[id];
        return true;
    }

    /**
     * 获取单个模板
     */
    get(id: string): INewInputTemplate | undefined {
        return this.storage.templates[id];
    }

    /**
     * 获取所有模板
     */
    list(): INewInputTemplate[] {
        return Object.values(this.storage.templates);
    }

    /**
     * 按分组获取模板
     */
    listByGroup(groupName: string): INewInputTemplate[] {
        return this.list().filter(t => t.group === groupName);
    }

    /**
     * 获取所有分组
     */
    getGroups(): TemplateGroup[] {
        return [...this.storage.groups].sort((a, b) => a.order - b.order);
    }

    /**
     * 添加分组
     */
    addGroup(group: TemplateGroup): void {
        this.storage.groups.push(group);
    }

    /**
     * 导出模板为 JSON
     */
    exportTemplate(id: string): string | null {
        const template = this.get(id);
        if (!template) {
            return null;
        }
        return JSON.stringify(template, null, 2);
    }

    /**
     * 导出所有模板
     */
    exportAll(): string {
        return JSON.stringify(this.storage, null, 2);
    }

    /**
     * 导入模板（从 JSON 字符串）
     */
    importTemplate(jsonStr: string): boolean {
        try {
            const template = JSON.parse(jsonStr) as INewInputTemplate;

            // 生成新 ID 避免冲突
            const oldId = template.id;
            delete template.id;
            delete template.createdAt;
            delete template.updatedAt;

            const newId = this.add(template);
            showMessage(`成功导入模板: ${template.name} (ID: ${oldId} → ${newId})`, 3000, 'info');
            return true;
        } catch (error) {
            console.error('[QuickInputTemplate] Failed to import template:', error);
            showMessage('导入模板失败：JSON 格式错误', 3000, 'error');
            return false;
        }
    }

    /**
     * 导入完整配置（包含所有模板和分组）
     */
    importAll(jsonStr: string): boolean {
        try {
            const data = JSON.parse(jsonStr) as TemplateStorage;
            this.storage = data;
            showMessage(`成功导入 ${Object.keys(data.templates).length} 个模板`, 3000, 'info');
            return true;
        } catch (error) {
            console.error('[QuickInputTemplate] Failed to import all templates:', error);
            showMessage('导入配置失败：JSON 格式错误', 3000, 'error');
            return false;
        }
    }

    /**
     * 创建默认示例模板
     */
    private createDefaultTemplates(): void {
        // 示例 1：开发 ISSUE 记录
//         this.add({
//             name: '开发 ISSUE',
//             desc: '在开发ISSUE目录下创建新问题记录',
//             icon: '🐛',
//             group: '开发',
//             newtype: 'document',
//             insertTo: {
//                 anchorGenerator: {
//                     type: 'hpath',
//                     notebook: '', // 用户需要配置笔记本 ID
//                     hpathTemplate: '/开发ISSUE/{{yearStr}}{{monthStr}}{{dayStr}}-{{title}}'
//                 }
//             },
//             template: `# {{title}}

// **类型**: {{type}}
// **状态**: 准备中
// **创建时间**: {{datetime}}

// ---

// ## 问题描述



// ## 解决方案



// ## 相关资源

// `,
//             declaredInputVar: {
//                 title: {
//                     type: 'text',
//                     label: '问题标题',
//                     description: '简短描述问题'
//                 },
//                 type: {
//                     type: 'enum',
//                     label: '类型',
//                     enum: ['新功能', '改进', 'BUG', '重构'],
//                     default: 'BUG'
//                 }
//             },
//             openBlock: true
//         });

//         // 示例 2：日记快速条目
//         this.add({
//             name: '日记条目',
//             desc: '在今日日记末尾添加快速记录',
//             icon: '📝',
//             group: '日常',
//             newtype: 'dailynote',
//             insertTo: {
//                 notebook: '', // 用户需要配置
//                 insert: 'append'
//             },
//             template: `## {{time}} - {{title}}

// {{content}}
// `,
//             declaredInputVar: {
//                 title: {
//                     type: 'text',
//                     label: '标题',
//                     description: '简短标题'
//                 },
//                 content: {
//                     type: 'text',
//                     label: '内容',
//                     description: '详细内容'
//                 }
//             },
//             openBlock: true
//         });

//         // 示例 3：月度统计（带脚本）
//         this.add({
//             name: '月度统计',
//             desc: '在汇总文档中追加本月统计数据',
//             icon: '📊',
//             group: '日常',
//             newtype: 'block',
//             insertTo: {
//                 anchorGenerator: {
//                     type: 'sql',
//                     searchCode: `SELECT * FROM blocks WHERE content = '月度汇总' AND type = 'h' LIMIT 1`
//                 },
//                 anchorUsage: {
//                     type: 'parent',
//                     insert: 'append'
//                 }
//             },
//             template: `**{{yearStr}}-{{monthStr}}**: 本月编辑文档数量 **{{count}}** 个`,
//             preExecuteScript: `// 查询本月编辑文档数
// const query = \`SELECT COUNT(*) as count FROM blocks WHERE type='d' AND updated LIKE '\${ctx.yearStr}\${ctx.monthStr}%'\`;
// const result = await window.siyuan.sql(query);
// return { count: result[0].count };`,
//             openBlock: false
//         });
    }
}

/**
 * 全局模板存储实例
 */
export const templateStore = new TemplateStore();
