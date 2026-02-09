/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-09
 * @FilePath     : /src/func/quick-input-template/index.tsx
 * @Description  : Quick Input Template 模块入口（HSPA 版本）
 */

import type FMiscPlugin from "@/index";

import { translateHotkey, confirmDialog } from "@frostime/siyuan-plugin-kits";
import { openIframeDialog } from "@/func/html-pages/core";
import { templateStore } from "./template-store";
import { templateExecutor } from "./executor";
import type { INewInputTemplate } from "./types";

export let name = "QuickInputTemplate";
export let enabled = false;

/**
 * 显示快速输入对话框 (HSPA)
 */
function showQuickInputDialog() {
    const templates = templateStore.list();
    const showGroups = templateStore.storage?.settings?.showGroupsInDialog ?? true;

    const dialog = openIframeDialog({
        title: '快速输入',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/quick-input-dialog.html',
            inject: {
                presetSdk: true,
                siyuanCss: true,
                customSdk: {
                    getTemplates: () => templates,
                    getShowGroups: () => showGroups,
                    onSelect: async (template: INewInputTemplate<any>) => {
                        dialog.close();
                        await templateExecutor.execute(template);
                    },
                    openManager: () => {
                        dialog.close();
                        showTemplateEditor();
                    }
                }
            }
        },
        width: '700px',
        height: '540px',
        maxHeight: '80vh'
    });
}

/**
 * 显示模板编辑器 (HSPA)
 */
function showTemplateEditor() {
    const templates = templateStore.list();

    openIframeDialog({
        title: '模板管理',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/template-editor.html',
            inject: {
                presetSdk: true,
                siyuanCss: true,
                customSdk: {
                    getTemplates: () => templates,
                    confirmDialog: (options: any) => confirmDialog(options),
                    onSave: async (updatedTemplates: INewInputTemplate<any>[]) => {
                        // 将数组转换为 Record
                        const templatesRecord: Record<string, INewInputTemplate<any>> = {};
                        updatedTemplates.forEach(t => {
                            templatesRecord[t.id] = t;
                        });
                        templateStore.storage.templates = templatesRecord;
                        await templateStore.save();
                    },
                    notebooks: () => {
                        // return window.siyuan.notebook
                        return window.siyuan.notebooks
                            // .filter((notebook) => notebook.closed !== true)
                            .map((notebook) => {
                                return {
                                    name: notebook.name,
                                    id: notebook.id,
                                    closed: notebook.closed
                                }
                            });
                    }
                }
            }
        },
        width: '1000px',
        height: '700px',
        maxWidth: '95%',
        maxHeight: '95%'
    });
}

/**
 * 加载模块
 */
export const load = async (plugin: FMiscPlugin) => {
    enabled = true;

    // 加载模板配置
    await templateStore.load();

    // 注册快捷键
    plugin.addCommand({
        langKey: 'quickInputTemplate',
        langText: '快速输入',
        hotkey: translateHotkey('Alt+I'),
        callback: () => {
            showQuickInputDialog();
        }
    });
};

/**
 * 卸载模块
 */
export const unload = () => {
    enabled = false;
};

/**
 * 声明启用开关
 */
export const declareToggleEnabled: IFuncModule['declareToggleEnabled'] = {
    title: '⚡ 快速输入模板',
    description: '通过快捷键 Alt+I 快速在指定位置插入预定义模板内容',
    defaultEnabled: true
};

/**
 * 声明模块配置
 */
export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'quick-input-template',
    title: '快速输入模板',
    load: async (_data: any) => {
        // 配置在 template-store 中已处理
    },
    dump: () => {
        return {};
    },
    items: [
        {
            key: 'showGroupsInDialog',
            type: 'checkbox' as const,
            title: '对话框中显示分组',
            description: '在快速输入对话框中是否显示分组选择器',
            get: () => templateStore.storage?.settings?.showGroupsInDialog ?? true,
            set: (value: boolean) => {
                if (!templateStore.storage.settings) {
                    templateStore.storage.settings = {};
                }
                templateStore.storage.settings.showGroupsInDialog = value;
                templateStore.save();
            }
        }
    ],
    customPanel: () => {
        const container = document.createElement('div');
        container.style.padding = '16px';

        const btn = document.createElement('button');
        btn.className = 'b3-button b3-button--outline';
        btn.textContent = '🛠️ 管理模板';
        btn.onclick = () => showTemplateEditor();

        container.appendChild(btn);
        return container;
    },
    help: () => {
        const { documentDialog } = require('@/libs/dialog');
        documentDialog({
            title: '快速输入模板 - 帮助文档',
            markdown: `
# 快速输入模板

## 功能介绍

快速输入模板功能允许您：
- 通过快捷键 **Alt+I** 快速唤起输入对话框
- 在不同位置插入预定义的模板内容（块、文档、日记）
- 支持用户输入变量
- 支持前后置脚本执行
- 支持模板渲染

## 使用方法

1. **唤起对话框**：按 **Alt+I**
2. **选择模板**：点击模板按钮
3. **填写变量**（如有）：在弹出的表单中输入必要信息
4. **自动插入**：模板会自动插入到配置的位置

## 模板类型

### Block（块插入）
在指定块的位置插入内容。可以通过 SQL 或 JS 检索找到锚点块。

### Document（文档）
创建新文档或在现有文档中插入内容。支持 hpath 模板渲染。

### Dailynote（日记）
在今日日记的开头或末尾插入内容。

## 模板语法

支持简单模板变量：
- 变量：\`{{variable}}\`
- 嵌套属性：\`{{variable.property}}\`

## 可用变量

基础时间变量：
- \`{{year}}\`, \`{{month}}\`, \`{{day}}\`
- \`{{yearStr}}\`, \`{{monthStr}}\`, \`{{dayStr}}\` (补零)
- \`{{date}}\`, \`{{time}}\`, \`{{datetime}}\`

用户定义变量：根据模板配置而定

## 管理模板

点击设置面板中的"管理模板"按钮，打开可视化编辑器。

## 示例

项目自带三个示例模板：
1. **开发 ISSUE**：创建开发问题记录文档
2. **日记条目**：快速添加日记内容
3. **月度统计**：自动计算并插入统计数据

`
        });
    }
};
