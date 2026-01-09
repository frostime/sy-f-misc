/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-03 22:43:01
 * @FilePath     : /src/func/gpt/tools/siyuan/content-tools.ts
 * @Description  : 思源内容操作相关工具
 */

import { Tool, ToolExecuteStatus, ToolExecuteResult, ToolPermissionLevel } from '../types';
import { BlockTypeShort, getBlockByID, getMarkdown, NodeType2BlockType, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { appendBlock, request, createDocWithMd } from "@frostime/siyuan-plugin-kits/api";
import { isIDFormat, isContainerBlock, getChildBlocks, getToc, HeaderNode } from './utils';

// ============ BlockInfo 类型定义 ============

interface BlockInfo {
    id: string;
    type: string;
    // 原始的完整 block 对象（来自 getBlockByID），用于以 YAML-like 形式展示元信息
    block?: Block;

    contentLength: number;
    markdownLength: number;
    markdownPreview: string; // 前 10 个字符

    // 容器块
    childBlockCount?: number;

    breadcrumb?: string;
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
        block: block as Block,
        contentLength: block.content?.length ?? 0,
        markdownLength: markdown.length,
        markdownPreview: markdown.substring(0, 10)
    };


    // 文档专属属性
    if (isDocument) {
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

    const breadcrumb = await request('/api/block/getBlockBreadcrumb', {
        id: id
    });
    if (breadcrumb) {
        const formatBreadItem = (item) => {
            return `- [${item.id}][${NodeType2BlockType[item.type] ?? '?'}] ${item.name}`
        }
        const breadcrumbInfo = `当前块在文档中的面包屑层级关系:
${breadcrumb.map(formatBreadItem).join('\n')}
`;
        info.breadcrumb = breadcrumbInfo;
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
function formatBlockInfo(blockInfo: BlockInfo): string {
    const lines: string[] = [];
    // === 属性部分（YAML-like） ===
    lines.push(`=== Block [${blockInfo.id}] attributes ===`);

    const ignoreKeys = new Set([
        'fcontent',
        'content',
        'markdown',
        'children',
    ]);

    const attrMap = {
        id: '块ID',
        box: '笔记本ID(box)',
        root_id: '文档ID(root_id)',
        parent_id: '父块ID(parent_id)',
        type: '块类型(type)',
    }

    const raw = blockInfo.block;
    const stringify = (v: any) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string') {
            const s = v.length > 200 ? v.substring(0, 200) + '...' : v;
            return s.replace(/\n/g, '\\n');
        }
        try {
            return JSON.stringify(v);
        } catch {
            return String(v);
        }
    };

    for (const key of Object.keys(blockInfo.block)) {
        if (ignoreKeys.has(key)) continue;
        let name = attrMap[key] || key;
        lines.push(`  ${name}: ${stringify((raw)[key])}`);
    }

    // === 保留的自定义/关键信息 ===
    // 文档块：展示完整 content（保留原有行为）
    if (blockInfo.type === 'd') {
        lines.push('');
        lines.push(`content: ${blockInfo.block.content}`);
    } else {
        lines.push('');
        lines.push(`content长度: ${blockInfo.contentLength}`);
        const preview = blockInfo.markdownPreview
            ? `"${blockInfo.markdownPreview}${blockInfo.markdownLength > 10 ? '...' : ''}"`
            : '(空)';
        lines.push(`内部 markdown 长度: ${blockInfo.markdownLength} (预览: ${preview})`);
    }

    // === 容器块子块数量 ===
    if (blockInfo.childBlockCount !== undefined) {
        lines.push('');
        lines.push(`容器内部子块数量: ${blockInfo.childBlockCount}`);
    }

    // === 文档大纲 ===
    if (blockInfo.toc && blockInfo.toc.length > 0) {
        lines.push('');
        lines.push('文档标题大纲:');
        lines.push(formatToc(blockInfo.toc));
    }

    // === 面包屑 ===
    if (blockInfo.breadcrumb) {
        lines.push('');
        lines.push(blockInfo.breadcrumb);
    }

    return lines.join('\n');
}

// ============ getBlockInfoTool ============

export const getBlockInfoTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getBlockInfo',
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
export const getBlockContentTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'getBlockContent',
            description: `获取块的 Markdown 内容，支持不同的查看模式

**使用场景**
- 阅读内容: 默认参数
- 定位编辑目标: 设置 showId=true
- 细粒度编辑子块: 设置 showId=true, showSubStructure=true

**块类型行为**
- 普通块: 返回自身 markdown
- 文档块: 总是返回所有子块内容拼接 (文档无自身 markdown)
- 标题块: 默认返回标题范围内所有内容; showSubStructure=true 时展开子块 ID
- 容器块 (引述/列表/超级块等): 默认返回格式化整体; showSubStructure=true 时展开原始子块`,
            parameters: {
                type: 'object',
                properties: {
                    blockId: {
                        type: 'string',
                        description: '块 ID'
                    },
                    showId: {
                        type: 'boolean',
                        description: '为每个块添加 @@{id}@@ 前缀，用于精确定位编辑目标。默认: showSubStructure 为 true 时自动启用'
                    },
                    showSubStructure: {
                        type: 'boolean',
                        description: '展开容器块/标题块的子块结构，显示每个子块的独立内容和 ID。用于细粒度编辑。默认: false'
                    }
                },
                required: ['blockId']
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { blockId: string, showId?: boolean, showSubStructure?: boolean }): Promise<ToolExecuteResult> => {
        const id = args.blockId;
        const showSubStructure = args.showSubStructure ?? false;
        const showId = args.showId ?? (showSubStructure ? true : false); // 优化默认值逻辑

        try {
            const block = await getBlockByID(id);
            if (!block) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到块: ${id}`
                };
            }

            let blocks = [];
            const isDocument = block.type === 'd';
            const isHeading = block.type === 'h';
            const needExpand = showSubStructure || isDocument || isHeading;

            if (needExpand) {
                const childBlocks = await request('/api/block/getChildBlocks', { id });
                blocks = childBlocks.map(b => ({
                    id: b.id,
                    markdown: b.markdown,
                    type: b.type ?? ''
                }));

                // 标题块特殊处理: 将标题自身插入顶部
                if (isHeading) {
                    blocks.unshift({
                        id: block.id,
                        markdown: block.markdown,
                        type: block.type ?? ''
                    });
                }
            } else {
                // 非展开模式：只返回当前块
                blocks = [{
                    id: block.id,
                    markdown: block.markdown,
                    type: block.type ?? ''
                }];
            }

            let content: string;
            if (showId) {
                content = blocks
                    .map(b => `@@${b.id}@@${BlockTypeShort[b.type] || ''}\n${b.markdown ?? ''}`)
                    .join('\n\n');
            } else {
                content = blocks
                    .map(b => b.markdown ?? '')
                    .join('\n\n');
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


/**
 * 创建新文档工具
 */
export const createNewDocTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'createNewDoc',
            description: `创建新的文档。支持在指定位置创建文档`,
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: '新文档标题, 不得包含 "/" 非法字符'
                    },
                    markdown: {
                        type: 'string',
                        description: '文档内容（Markdown 格式）。默认为空'
                    },
                    anchorDocumentId: {
                        type: 'string',
                        description: '锚点文档 ID，用于确定新文档的创建位置'
                    },
                    location: {
                        type: 'string',
                        enum: ['siblings', 'children', 'parent'],
                        description: `相对于锚点文档的位置：
- siblings: 同级（在同一父目录下）
- children: 子文档（在锚点文档内部）
- parent: 父级同级（与锚点的父文档同级）`
                    }
                },
                required: ['title', 'anchorDocumentId', 'location']
            }
        }
    },

    permission: {
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },

    declaredReturnType: {
        type: '{ success: true; docId: string; hpath: string; location: string }',
        note: 'docId 为新创建的文档 ID，hpath 为文档的可读路径'
    },

    execute: async (args: {
        title: string;
        markdown?: string;
        anchorDocumentId: string;
        location: 'siblings' | 'children' | 'parent';
    }): Promise<ToolExecuteResult> => {
        let { title, markdown = '', anchorDocumentId, location } = args;

        // 参数验证
        if (!title || title.trim().length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '请提供文档标题'
            };
        }

        if (title.includes('/')) {
            title = title.replace(/\//g, '-');
        }

        if (!anchorDocumentId || !isIDFormat(anchorDocumentId)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `无效的锚点文档 ID: ${anchorDocumentId}`
            };
        }

        if (!['siblings', 'children', 'parent'].includes(location)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `无效的 location 参数: ${location}，应为 siblings/children/parent`
            };
        }

        try {
            // 获取锚点文档信息
            const anchorDoc = await getBlockByID(anchorDocumentId);
            if (!anchorDoc) {
                return {
                    status: ToolExecuteStatus.NOT_FOUND,
                    error: `未找到锚点文档: ${anchorDocumentId}`
                };
            }

            if (anchorDoc.type !== 'd') {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `锚点 ID 不是文档类型，而是 ${anchorDoc.type} 类型的块`
                };
            }

            const notebookId = anchorDoc.box;
            let newDocPath: string;

            // 根据 location 计算新文档路径
            // anchorDoc.path 格式: /20260107143325-zbrtqup/20260107143334-l5eqs5i.sy
            const pathParts = anchorDoc.path.split('/').filter(p => p);
            // pathParts: ['20260107143325-zbrtqup', '20260107143334-l5eqs5i.sy']

            if (location === 'children') {
                // 子文档：在锚点文档下创建
                // 新路径: /锚点文档hpath/新标题
                newDocPath = `${anchorDoc.hpath}/${title}`;
            } else if (location === 'siblings') {
                // 同级：在锚点文档的同一父目录下创建
                if (pathParts.length <= 1) {
                    // 锚点文档在笔记本根目录，同级就是根目录
                    newDocPath = `/${title}`;
                } else {
                    // 取父目录的 hpath
                    const hpathParts = anchorDoc.hpath.split('/').filter(p => p);
                    hpathParts.pop(); // 移除锚点文档自身
                    const parentHpath = hpathParts.length > 0 ? `/${hpathParts.join('/')}` : '';
                    newDocPath = `${parentHpath}/${title}`;
                }
            } else if (location === 'parent') {
                // 父级同级：在锚点文档的父文档同级创建
                if (pathParts.length <= 1) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: '锚点文档位于笔记本根目录，没有父文档'
                    };
                }
                if (pathParts.length <= 2) {
                    // 父文档在根目录，父级同级就是根目录
                    newDocPath = `/${title}`;
                } else {
                    // 取祖父目录的 hpath
                    const hpathParts = anchorDoc.hpath.split('/').filter(p => p);
                    hpathParts.pop(); // 移除锚点文档自身
                    hpathParts.pop(); // 移除父文档
                    const grandparentHpath = hpathParts.length > 0 ? `/${hpathParts.join('/')}` : '';
                    newDocPath = `${grandparentHpath}/${title}`;
                }
            }

            // 创建文档
            const newDocId = await createDocWithMd(notebookId, newDocPath, markdown);

            if (!newDocId) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: '创建文档失败'
                };
            }

            // 获取新文档信息以返回完整路径
            const newDoc = await getBlockByID(newDocId);

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    success: true,
                    docId: newDocId,
                    hpath: newDoc?.hpath || newDocPath,
                    location
                }
            };

        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `创建文档失败: ${error.message}`
            };
        }
    },

    formatForLLM: (data: { success: boolean; docId: string; hpath: string; location: string }): string => {
        if (!data || !data.success) return '(创建失败)';

        const locationLabel = {
            siblings: '同级',
            children: '子文档',
            parent: '父级同级'
        }[data.location] || data.location;

        return `已成功创建文档 [${data.hpath}](siyuan://blocks/${data.docId}) (位置: ${locationLabel})`;
    }
};

