/**
 * 文件编辑工具：fs-SearchReplace, fs-WriteFile
 * 直接使用 Node.js API
 */

import { Tool, ToolExecuteResult, ToolExecuteStatus } from "../types";

const nodeFs: typeof import('fs') = window?.require?.('fs');
const nodePath: typeof import('path') = window?.require?.('path');

// ============================================================
// fs-SearchReplace
// ============================================================

export const searchReplaceTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs-SearchReplace',
            description: '基于内容匹配的代码替换工具。格式为 SEARCH/REPLACE 块，支持批量操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '文件路径' },
                    blocks: { type: 'string', description: 'SEARCH/REPLACE 块' },
                    withinRange: {
                        type: 'object',
                        properties: {
                            startLine: { type: 'number' },
                            endLine: { type: 'number' }
                        }
                    }
                },
                required: ['path', 'blocks']
            }
        }
    },

    permission: {
        executionPolicy: 'ask-always',
        resultApprovalPolicy: 'always'
    },

    execute: async (args: {
        path: string;
        blocks: string;
        withinRange?: { startLine?: number; endLine?: number };
    }): Promise<ToolExecuteResult> => {
        const engine = await import("@external/text-edit-engine");

        const filePath = nodePath.resolve(args.path);
        if (!nodeFs.existsSync(filePath)) {
            return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };
        }

        try {
            const content = nodeFs.readFileSync(filePath, 'utf-8');
            const blocks = engine.parseSearchReplaceBlocks(args.blocks);
            if (blocks.length === 0) {
                return { status: ToolExecuteStatus.ERROR, error: '未找到有效的 SEARCH/REPLACE 块' };
            }

            const result = engine.applySearchReplace(content, blocks, {
                withinRange: args.withinRange
            });

            if (!result.success) {
                return { status: ToolExecuteStatus.ERROR, error: result.error };
            }

            nodeFs.writeFileSync(filePath, result.content!, 'utf-8');

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    file: nodePath.basename(filePath),
                    ...result.stats
                }
            };
        } catch (error: any) {
            return { status: ToolExecuteStatus.ERROR, error: error.message };
        }
    },

    formatForLLM: (data: any) => {
        const changes = data.changes.map((c: any) =>
            `行 ${c.startLine}: -${c.removed} +${c.added} (${c.matchType})`
        ).join('\n');
        return `✓ ${data.file}: 应用了 ${data.blocksApplied} 个替换块\n${changes}`;
    }
};

// ============================================================
// fs-WriteFile
// ============================================================

export const writeFileTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs-WriteFile',
            description: '写入完整文件内容。适用于：(1) 创建新文件 (2) 大规模重写（>50% 变更）',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '文件路径' },
                    content: { type: 'string', description: '完整文件内容' },
                    mode: {
                        type: 'string',
                        enum: ['append', 'overwrite', 'create'],
                        description: '写入模式：create（默认，文件存在报错）、overwrite（覆盖）、append（追加）'
                    }
                },
                required: ['path', 'content', 'mode']
            }
        }
    },

    permission: {
        executionPolicy: 'ask-always',
        resultApprovalPolicy: 'always'
    },

    execute: async (args: {
        path: string;
        content: string;
        mode?: 'append' | 'overwrite' | 'create';
    }): Promise<ToolExecuteResult> => {
        const mode = args.mode || 'create';

        try {
            const filePath = nodePath.resolve(args.path);
            const exists = nodeFs.existsSync(filePath);

            if (mode === 'create' && exists) {
                return { status: ToolExecuteStatus.ERROR, error: `文件已存在: ${filePath}，请使用 mode: 'overwrite'` };
            }

            // 确保父目录存在
            const dir = nodePath.dirname(filePath);
            if (!nodeFs.existsSync(dir)) {
                nodeFs.mkdirSync(dir, { recursive: true });
            }

            let content = args.content;
            if (mode === 'append' && exists) {
                const existing = nodeFs.readFileSync(filePath, 'utf-8');
                content = existing + '\n' + args.content;
            }

            nodeFs.writeFileSync(filePath, content, 'utf-8');

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    file: nodePath.basename(filePath),
                    lines: content.split('\n').length,
                    bytes: new TextEncoder().encode(content).length,
                    mode
                }
            };
        } catch (error: any) {
            return { status: ToolExecuteStatus.ERROR, error: error.message };
        }
    },

    formatForLLM: (data: any) => `✓ ${data.file}: 已写入 ${data.lines} 行 (${data.bytes} bytes, mode=${data.mode})`
};
