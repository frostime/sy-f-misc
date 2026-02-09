/*
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2026-01-09
 * @FilePath     : /src/func/quick-input-template/executor.ts
 * @Description  : 模板执行引擎
 */

import { showMessage } from "siyuan";
import { thisPlugin, openBlock, createDailynote, getBlockByID } from "@frostime/siyuan-plugin-kits";
import { sql, insertBlock, prependBlock, appendBlock, createDocWithMd } from "@/api";
import { simpleFormDialog } from "@/libs/dialog";
import { SimpleFormField } from "@/libs/components/simple-form";
import {
    INewInputTemplate,
    IBasicVar,
    IMidVar,
    ITemplateVar,
    InsertToAnchor,
    InputPlace,
    IDeclaredInputVar
} from "./types";

/**
 * 获取基础时间变量
 */
function getBasicVar(): IBasicVar {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const second = now.getSeconds();

    return {
        year: year.toString(),
        month: month.toString().padStart(2, '0'),
        day: day.toString().padStart(2, '0'),
        hour: hour.toString().padStart(2, '0'),
        minute: minute.toString().padStart(2, '0'),
        second: second.toString().padStart(2, '0'),
        date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`,
        datetime: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`
    };
}

/**
 * 收集用户输入
 */
async function collectUserInput(declaredInputVar?: IDeclaredInputVar): Promise<Record<string, any>> {
    if (!declaredInputVar || Object.keys(declaredInputVar).length === 0) {
        return {};
    }

    // 转换为 simple-form 字段格式
    const fields: SimpleFormField[] = Object.entries(declaredInputVar).map(([key, config]) => {
        const field: SimpleFormField = {
            key,
            label: config.label || key,
            type: config.type === 'enum' ? 'select' : config.type === 'bool' ? 'checkbox' : config.type === 'number' ? 'number' : 'text',
            value: config.default ?? (config.type === 'bool' ? false : ''),
            description: config.description
        };

        if (config.type === 'enum' && config.enum) {
            field.options = config.enum.reduce((acc, val) => {
                acc[String(val)] = String(val);
                return acc;
            }, {} as Record<string, string>);
        }

        if (config.type === 'number' && config.number) {
            field.min = config.number.min;
            field.max = config.number.max;
            field.step = config.number.step;
        }

        return field;
    });

    const result = await simpleFormDialog({
        title: '请输入变量',
        fields,
        width: '500px',
        maxHeight: '70vh'
    });

    if (!result.ok) {
        throw new Error('用户取消输入');
    }

    return result.values || {};
}

/**
 * 渲染模板（使用 Squirrelly）
 */
async function renderTemplate(template: string | undefined, vars: Record<string, any>): Promise<string> {
    if (!template) {
        return '';
    }

    // 简单但强大的模板替换，支持 {{varName}} 和 {{varName.property}} 语法
    return template.replace(/\{\{(.*?)\}\}/g, (match, path) => {
        const trimmedPath = path.trim();
        const parts = trimmedPath.split('.');
        let value: any = vars;

        for (const part of parts) {
            if (value && typeof value === 'object' && part in value && value[part]) {
                value = value[part];
            } else {
                return match; // 保留原始占位符如果变量不存在
            }
        }

        return value !== null && value !== undefined ? String(value) : '';
    });
}

/**
 * 执行脚本（沙箱化）
 */
async function executeScript(script: string, ctx: Record<string, any>): Promise<Record<string, any>> {
    try {
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        const fn = new AsyncFunction('ctx', script);
        const result = await fn(ctx);
        return result || {};
    } catch (error) {
        console.error('[QuickInputTemplate] Script execution error:', error);
        showMessage(`脚本执行错误: ${error.message}`, 3000, 'error');
        return {};
    }
}

/**
 * 计算插入位置
 */
async function resolveInsertToAnchor<T extends InputPlace>(
    template: INewInputTemplate<T>,
    midVar: IMidVar
): Promise<{ anchor: any; root: Block }> {
    const { newtype, insertTo } = template;

    switch (newtype) {
        case 'block': {
            const config = insertTo as INewInputTemplate<'block'>['insertTo'];

            // 执行锚点生成器
            let anchorBlock: Block | null = null;

            if (config.anchorGenerator) {
                if (config.anchorGenerator.type === 'sql') {
                    const blocks = await sql(config.anchorGenerator.searchCode);
                    if (blocks && blocks.length > 0) {
                        anchorBlock = blocks[0];
                    }
                } else if (config.anchorGenerator.type === 'js') {
                    const result = await executeScript(config.anchorGenerator.searchCode, midVar);
                    anchorBlock = result as unknown as Block;
                }
            }

            if (!anchorBlock) {
                throw new Error('未找到锚点块，请检查 anchorGenerator 配置');
            }

            // 获取根文档
            const root = await getBlockByID(anchorBlock.root_id);
            if (!root) {
                throw new Error('无法获取根文档');
            }

            return {
                anchor: { anchor: anchorBlock } as InsertToAnchor['block'],
                root: root as any as Block
            };
        }

        case 'document': {
            const config = insertTo as INewInputTemplate<'document'>['insertTo'];
            let docBlock: Block | null = null;

            if (config.anchorGenerator.type === 'hpath') {
                // 渲染 hpath 模板
                const hpath = await renderTemplate(config.anchorGenerator.hpathTemplate, midVar);
                const notebook = config.anchorGenerator.notebook;

                // 尝试查找文档
                const query = `SELECT * FROM blocks WHERE type='d' AND box='${notebook}' AND hpath='${hpath}' LIMIT 1`;
                const blocks = await sql(query);

                if (blocks && blocks.length > 0) {
                    docBlock = blocks[0];
                } else {
                    // 创建新文档
                    const docId = await createDocWithMd(notebook, hpath, '');
                    if (!docId) {
                        throw new Error(`无法创建文档: ${hpath}`);
                    }
                    const block = await getBlockByID(docId);
                    if (!block) {
                        throw new Error(`创建文档后无法获取块信息: ${docId}`);
                    }
                    docBlock = block as any as Block;
                }
            } else if (config.anchorGenerator.type === 'search') {
                if (config.anchorGenerator.searchType === 'sql') {
                    const blocks = await sql(config.anchorGenerator.searchCode);
                    if (blocks && blocks.length > 0) {
                        docBlock = blocks[0];
                    }
                } else {
                    const result = await executeScript(config.anchorGenerator.searchCode, midVar);
                    docBlock = result as unknown as Block;
                }
            }

            if (!docBlock) {
                throw new Error('无法找到或创建目标文档');
            }

            return {
                anchor: {
                    notebook: docBlock.box,
                    hpath: docBlock.hpath
                } as any as InsertToAnchor[T],
                root: docBlock as any as Block
            };
        }

        case 'dailynote': {
            const config = insertTo as INewInputTemplate<'dailynote'>['insertTo'];

            try {
                // 创建或获取今日日记
                const docId = await createDailynote(
                    config.notebook,
                    new Date(),
                    '',
                    thisPlugin().app.appId
                );

                if (!docId) {
                    throw new Error('创建日记失败：未返回文档 ID');
                }

                const block = await getBlockByID(docId);
                if (!block) {
                    throw new Error(`无法获取日记文档块信息: ${docId}`);
                }

                return {
                    anchor: {
                        notebook: config.notebook
                    } as any as InsertToAnchor[T],
                    root: block as any as Block
                };
            } catch (error) {
                console.error('[QuickInputTemplate] Dailynote creation error:', error);
                throw new Error(`日记创建失败: ${error.message || error}`);
            }
        }

        default:
            throw new Error(`不支持的插入类型: ${newtype}`);
    }
}

/**
 * 插入内容
 */
async function insertContent<T extends InputPlace>(
    template: INewInputTemplate<T>,
    content: string,
    anchor: InsertToAnchor[T],
    root: Block
): Promise<string> {
    const { newtype, insertTo } = template;

    switch (newtype) {
        case 'block': {
            const config = insertTo as INewInputTemplate<'block'>['insertTo'];
            const anchorBlock = (anchor as InsertToAnchor['block']).anchor;

            let result: any;

            if (config.anchorUsage.type === 'parent') {
                // 作为容器使用
                if (config.anchorUsage.insert === 'prepend') {
                    result = await prependBlock('markdown', content, anchorBlock.id);
                } else {
                    result = await appendBlock('markdown', content, anchorBlock.id);
                }
            } else {
                // 作为同级块使用
                if (config.anchorUsage.insert === 'previous') {
                    result = await insertBlock('markdown', content, undefined, anchorBlock.id);
                } else {
                    result = await insertBlock('markdown', content, anchorBlock.id);
                }
            }

            return result?.[0]?.doOperations?.[0]?.id || root.id;
        }

        case 'document': {
            // 直接追加到文档末尾
            const result = await appendBlock('markdown', content, root.id);
            return result?.[0]?.doOperations?.[0]?.id || root.id;
        }

        case 'dailynote': {
            const config = insertTo as INewInputTemplate<'dailynote'>['insertTo'];

            let result: any;
            if (config.insert === 'prepend') {
                result = await prependBlock('markdown', content, root.id);
            } else {
                result = await appendBlock('markdown', content, root.id);
            }

            return result?.[0]?.doOperations?.[0]?.id || root.id;
        }

        default:
            throw new Error(`不支持的插入类型: ${newtype}`);
    }
}

/**
 * 模板执行器类
 */
export class TemplateExecutor {
    /**
     * 执行模板
     */
    async execute<T extends InputPlace>(template: INewInputTemplate<T>): Promise<void> {
        try {
            // 1. 收集用户输入
            const userInput = await collectUserInput(template.declaredInputVar);

            // 2. 构建 IMidVar
            const midVar: IMidVar = { ...getBasicVar(), ...userInput };

            // 3. 计算插入位置
            const { anchor, root } = await resolveInsertToAnchor(template, midVar);

            // 4. 构建 ITemplateVar
            const templateVar: ITemplateVar = {
                ...midVar,
                root,
                anchor: (anchor as any).anchor || root
            };

            // 5. 执行 preExecuteScript
            if (template.preExecuteScript) {
                const scriptResult = await executeScript(template.preExecuteScript, templateVar);
                Object.assign(templateVar, scriptResult);
            }

            // 6. 渲染模板内容
            const content = await renderTemplate(template.template, templateVar);

            // 7. 插入内容
            const insertedBlockId = await insertContent(template, content, anchor, root);

            // 8. 执行 postExecuteScript
            if (template.postExecuteScript) {
                await executeScript(template.postExecuteScript, {
                    ...templateVar,
                    content,
                    blockId: insertedBlockId
                });
            }

            // 9. 打开编辑位置（可选）
            if (template.openBlock !== false) {
                openBlock(insertedBlockId, { app: thisPlugin().app });
            }

            showMessage(`模板执行成功: ${template.name}`, 2000, 'info');

        } catch (error) {
            console.error('[QuickInputTemplate] Execution error:', error);
            if (error.message === '用户取消输入') {
                showMessage('已取消', 2000, 'info');
            } else {
                showMessage(`模板执行失败: ${error.message}`, 3000, 'error');
            }
        }
    }
}

/**
 * 全局执行器实例
 */
export const templateExecutor = new TemplateExecutor();
