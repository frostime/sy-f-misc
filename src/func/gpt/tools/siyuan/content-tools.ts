/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/content-tools.ts
 * @Description  : 思源内容操作相关工具
 */

import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { BlockTypeShort, getBlockByID, getMarkdown, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { appendBlock, request } from "@frostime/siyuan-plugin-kits/api";
import { isIDFormat, isContainerBlock, getChildBlocks, getToc, HeaderNode } from './utils';

// ============ BlockInfo 类型定义 ============

interface BlockInfo {
    id: string;
    type: string;
    // 基础属性
    path?: string;
    hpath?: string;
    contentLength: number;
    markdownLength: number;
    markdownPreview: string; // 前 10 个字符
    // 文档专属 (type='d')
    content?: string;
    box?: string;
    root_id?: string;
    // 容器块
    childBlockCount?: number;
    // 文档大纲
    toc?: HeaderNode[];
}

// ============ 辅助函数 ============

/**
 * 获取单个块的详细信息
 */
async function fetchBlockInfo(id: string): Promise<BlockInfo | null> {
    const block = await getBlockByID(id);
    if (!block) return null;

    let markdown = '';
    try {
        markdown = await getMarkdown(id) || '';
    } catch {
        markdown = '';
    }

    const isDocument = block.type === 'd';
    const isContainer = await isContainerBlock(id);

    const info: BlockInfo = {
        id: block.id,
        type: block.type,
        contentLength: block.content?.length ?? 0,
        markdownLength: markdown.length,
        markdownPreview: markdown.substring(0, 10)
    };

    // 所有块都有 path（如果存在）
    if (block.path) info.path = block.path;
    if (block.hpath) info.hpath = block.hpath;

    // 文档专属属性
    if (isDocument) {
        info.content = block.content;
        info.box = block.box;
        info.root_id = block.root_id;

        // 获取 TOC
        try {
            const toc = await getToc(id);
            if (toc && toc.length > 0) {
                info.toc = toc;
            }
        } catch {
            // TOC 获取失败时忽略
        }
    }

    // 容器块：获取子块数量
    if (isContainer) {
        try {
            const children = await getChildBlocks(id);
            info.childBlockCount = children.length;
        } catch {
            info.childBlockCount = 0;
        }
    }

    return info;
}

/**
 * 格式化 TOC 为 Markdown 列表
 */
function formatToc(nodes: HeaderNode[], depth: number = 0): string {
    const lines: string[] = [];
    const indent = '  '.repeat(depth);

    for (const node of nodes) {
        lines.push(`${indent}- ${node.content}[${node.blockId}]`);
        if (node.children && node.children.length > 0) {
            lines.push(formatToc(node.children, depth + 1));
        }
    }

    return lines.join('\n');
}

/**
 * 格式化单个 BlockInfo
 */
function formatBlockInfo(block: BlockInfo): string {
    const lines: string[] = [];

    // === 属性部分 ===
    lines.push(`=== Block [${block.id}] ===`);
    lines.push(`type: ${block.type}`);

    if (block.path) lines.push(`path: ${block.path}`);
    if (block.hpath) lines.push(`hpath: ${block.hpath}`);

    // 文档块：显示完整 content
    if (block.type === 'd') {
        lines.push(`content: ${block.content}`);
        lines.push(`box: ${block.box}`);
        lines.push(`root_id: ${block.root_id}`);
    }

    // 非文档块：显示长度和预览
    lines.push(`content长度: ${block.contentLength}`);
    const preview = block.markdownPreview
        ? `"${block.markdownPreview}${block.markdownLength > 10 ? '...' : ''}"`
        : '(空)';
    lines.push(`内部 markdown 长度: ${block.markdownLength} (预览: ${preview})`);

    // === 容器块子块数量 ===
    if (block.childBlockCount !== undefined) {
        lines.push('');
        lines.push(`容器内部子块数量: ${block.childBlockCount}`);
    }

    // === 文档大纲 ===
    if (block.toc && block.toc.length > 0) {
        lines.push('');
        lines.push('文档标题大纲:');
        lines.push(formatToc(block.toc));
    }

    return lines.join('\n');
}

// ============ inspectBlockTool ============

export const inspectBlockInfoTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'inspectBlockInfo',
            description: '获取块（包括文档）的元信息与结构。支持单个或多个ID，返回类型、路径、内容长度、子块数量、文档大纲等信息',
            parameters: {
                type: 'object',
                properties: {
                    ids: {
                        type: 'string',
                        description: '块ID。单个ID或逗号分隔的多个ID（如 "id1,id2,id3"）'
                    }
                },
                required: ['ids']
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    declaredReturnType: {
        type: 'BlockInfo | { blocks: BlockInfo[]; notFoundIds?: string[] }',
        note: '单个ID返回BlockInfo，多个ID返回对象格式'
    },

    execute: async (args: { ids: string }): Promise<ToolExecuteResult> => {
        if (!args.ids || !args.ids.trim()) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '请提供 ids 参数'
            };
        }

        // 解析 ID 列表（支持逗号分隔）
        const idList = args.ids
            .split(',')
            .map(id => id.trim())
            .filter(id => id.length > 0);

        if (idList.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '请提供有效的块ID'
            };
        }

        // 验证 ID 格式
        for (const id of idList) {
            if (!isIDFormat(id)) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `无效的ID格式: ${id}`
                };
            }
        }

        try {
            const blocks: BlockInfo[] = [];
            const notFoundIds: string[] = [];

            for (const id of idList) {
                const blockInfo = await fetchBlockInfo(id);
                if (blockInfo) {
                    blocks.push(blockInfo);
                } else {
                    notFoundIds.push(id);
                }
            }

            if (blocks.length === 0) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到任何块: ${notFoundIds.join(', ')}`
                };
            }

            // 单个 ID 且找到：返回单个对象
            if (idList.length === 1 && blocks.length === 1) {
                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: blocks[0]
                };
            }

            // 多个 ID：返回列表格式
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    blocks,
                    notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined
                }
            };

        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取块信息失败: ${error.message}`
            };
        }
    },

    formatForLLM: (data: BlockInfo | { blocks: BlockInfo[]; notFoundIds?: string[] }): string => {
        if (!data) return '(空)';

        // 单个块（检查是否有 blocks 字段来区分）
        if ('id' in data && 'type' in data && !('blocks' in data)) {
            return formatBlockInfo(data as BlockInfo);
        }

        // 多个块
        const result = data as { blocks: BlockInfo[]; notFoundIds?: string[] };
        const lines: string[] = [];

        lines.push(`---块信息 (共 ${result.blocks.length} 个)---`);

        for (let i = 0; i < result.blocks.length; i++) {
            if (i > 0) lines.push(''); // 块之间空一行
            lines.push(formatBlockInfo(result.blocks[i]));
        }

        if (result.notFoundIds && result.notFoundIds.length > 0) {
            lines.push('');
            lines.push(`[未找到] ${result.notFoundIds.join(', ')}`);
        }

        return lines.join('\n');
    }
};


// ============ 其他工具保持不变 ============

/**
 * 获取块完整Markdown内容工具
 */
export const inspectBlockMarkdownTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'inspectBlockMarkdown',
            description: `获取块的完整Markdown内容; 可以是普通块或容器块
- 对于普通块，返回该块的Markdown内容
- 对于容器块，返回该容器内所有子块内容的拼接
- 对比文档块，返回文档内所有块内容的拼接
- 对于标题块，返回当前标题范围下所有块内容的拼接 (标题块非容器)

如果需要分析块的内容结构，可设置 showId 为 true，则在每个块内容前添加 @@块ID@@块类型 标记，以便保持块结构和 Markdown 文本之间的映射关联
`,
            parameters: {
                type: 'object',
                properties: {
                    blockId: {
                        type: 'string',
                        description: '块ID'
                    },
                    showId: {
                        type: 'boolean',
                        description: '显示块 ID 以便保持块结构和 Markdown 文本之间的映射关联'
                    }
                },
                required: ['blockId']
            }
        }
    },

    permission: {
        requireExecutionApproval: false,
        requireResultApproval: true
    },

    declaredReturnType: {
        type: 'string',
        note: 'Markdown 文本内容'
    },

    execute: async (args: { blockId: string, showId?: boolean }): Promise<ToolExecuteResult> => {
        const id = args.blockId;
        const showId = args.showId ?? false;
        try {
            let block = await getBlockByID(id);
            if (!block) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到块: ${id}`
                };
            }
            let blocks = [];
            const childBlocks = await request('/api/block/getChildBlocks', { id });
            if (childBlocks && childBlocks.length > 0) {
                blocks = childBlocks.map(b => ({ id: b.id, markdown: b.markdown , type: b.type ?? ''}));
            }
            else {
                blocks = [{ id: block.id, markdown: block.markdown, type: block.type ?? '' }];
            }
            let content: string;

            if (showId === true) {
                content = blocks.map(b => `@@${b.id}@@${BlockTypeShort[b.type] || ''}\n${b.markdown}`).join('\n\n');
            } else {
                content = blocks.map(b => b.markdown).join('\n\n');
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: content
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `获取块内容失败: ${error.message}`
            };
        }
    }
};

/**
 * 统一的追加内容工具
 */
export const appendContentTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'appendContent',
            description: `向指定目标追加 Markdown 内容。支持追加到日记、文档或块

- daily note / document: 追加到文档末尾
- block
  - 追加到容器块(如引述块超级块)、 标题块的末尾
  - 追加到普通叶子块(如段落块)的后面，作为同级块追加
`,
            parameters: {
                type: 'object',
                properties: {
                    markdown: {
                        type: 'string',
                        description: '要追加的 Markdown 内容'
                    },
                    targetType: {
                        type: 'string',
                        enum: ['dailynote', 'document', 'block'],
                        description: `目标类型：
- dailynote: 追加到今日日记（自动创建）
- document: 追加到指定文档末尾
- block: 追加到指定块末尾（与 document 行为相同，语义区分）`
                    },
                    target: {
                        type: 'string',
                        description: `目标ID：
- dailynote: 笔记本 ID (notebook id)
- document: 文档 ID (document id)
- block: 块 ID (block id)`
                    }
                },
                required: ['markdown', 'targetType', 'target']
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    declaredReturnType: {
        type: '{ success: true; targetId: string; targetType: string }',
        note: 'targetId 为实际写入的文档/块 ID（dailynote 返回日记文档 ID）'
    },

    execute: async (args: {
        markdown: string;
        targetType: 'dailynote' | 'document' | 'block';
        target: string;
    }): Promise<ToolExecuteResult> => {
        const { markdown, targetType, target } = args;

        // 参数验证
        if (!markdown || markdown.trim().length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '请提供 markdown 内容'
            };
        }

        if (!target || target.trim().length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '请提供 target 参数'
            };
        }

        if (!['dailynote', 'document', 'block'].includes(targetType)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `无效的 targetType: ${targetType}，应为 dailynote/document/block`
            };
        }

        try {
            let actualTargetId: string;

            if (targetType === 'dailynote') {
                // 日记模式：target 是 notebook id，自动创建/获取今日日记
                const url = '/api/filetree/createDailyNote';
                const app = thisPlugin().app;
                const ans = await request(url, { notebook: target, app: app?.appId });

                if (!ans || !ans.id) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `创建日记失败，请确认笔记本 ID 正确: ${target}`
                    };
                }

                actualTargetId = ans.id;
                await appendBlock('markdown', markdown, actualTargetId);
            } else {
                // document 或 block 模式：直接追加
                // 先验证目标是否存在
                const block = await getBlockByID(target);
                if (!block) {
                    return {
                        status: ToolExecuteStatus.NOT_FOUND,
                        error: `未找到目标 ${targetType}: ${target}`
                    };
                }

                actualTargetId = target;
                await appendBlock('markdown', markdown, actualTargetId);
            }

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    success: true,
                    targetId: actualTargetId,
                    targetType
                }
            };

        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `追加内容失败: ${error.message}`
            };
        }
    },

    formatForLLM: (data: { success: boolean; targetId: string; targetType: string }): string => {
        if (!data || !data.success) return '(操作失败)';

        const typeLabel = {
            dailynote: '日记文档',
            document: '文档',
            block: '块'
        }[data.targetType] || data.targetType;

        return `已成功追加内容到${typeLabel} [${data.targetId}]`;
    }
};

