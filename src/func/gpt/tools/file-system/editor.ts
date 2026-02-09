/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-15 01:22:12
 * @Description  : VFS-based editor tools (SearchReplace, ApplyDiff, ReplaceLine, WriteFile)
 * @FilePath     : /src/func/gpt/tools/file-system/editor.ts
 * @LastEditTime : 2026-01-06 22:59:40
 */

import { VFSManager } from '@/libs/vfs';
import { Tool, ToolExecuteResult, ToolExecuteStatus } from "../types";



// ============================================================
// 工具工厂
// ============================================================

export function createEditorTools(vfs: VFSManager): Tool[] {
    const searchReplaceTool: Tool = {
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
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: 'VFS 不可用' };
            }

            const engine = await import("@external/text-edit-engine");

            const { fs, path } = vfs.route(args.path);
            const filePath = fs.resolve(path);
            if (!await fs.exists(filePath)) {
                return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };
            }

            try {
                const content = await fs.readFile(filePath);

                // 解析块
                const blocks = engine.parseSearchReplaceBlocks(args.blocks);
                if (blocks.length === 0) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: '未找到有效的 SEARCH/REPLACE 块'
                    };
                }

                const result = engine.applySearchReplace(content, blocks, {
                    withinRange: args.withinRange
                });

                if (!result.success) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: result.error
                    };
                }

                // 写回文件
                await fs.writeFile(filePath, result.content!);

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        file: fs.basename(filePath),
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

    const applyDiffTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs-ApplyDiff',
                description: '应用 Unified Diff 格式补丁',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        diff: { type: 'string' },
                        withinRange: {
                            type: 'object',
                            properties: {
                                startLine: { type: 'number' },
                                endLine: { type: 'number' }
                            }
                        }
                    },
                    required: ['path', 'diff']
                }
            }
        },

        permission: {
            executionPolicy: 'ask-always',
            resultApprovalPolicy: 'always'
        },

        execute: async (args: {
            path: string;
            diff: string;
            withinRange?: { startLine?: number; endLine?: number };
        }): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: 'VFS 不可用' };
            }

            const engine = await import("@external/text-edit-engine");

            const { fs, path } = vfs.route(args.path);
            const filePath = fs.resolve(path);
            if (!await fs.exists(filePath)) {
                return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };
            }

            try {
                const content = await fs.readFile(filePath);

                const result = engine.applyDiff(content, args.diff, {
                    withinRange: args.withinRange
                });

                if (!result.success) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: result.error
                    };
                }

                await fs.writeFile(filePath, result.content!);

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        file: fs.basename(filePath),
                        hunks: result.stats!.blocksApplied,
                        removed: result.stats!.linesRemoved,
                        added: result.stats!.linesAdded,
                        changes: result.stats!.changes
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
            return `✓ ${data.file}: 应用了 ${data.hunks} 个 hunk (-${data.removed} +${data.added})\n${changes}`;
        }
    };

    //Keep here; 未来考虑再加回来
    const replaceLineTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs-ReplaceLine',
                description: '快速替换单行内容（需提供原始内容验证）。适用于简单的单行修改。',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '文件路径' },
                        line: { type: 'number', description: '行号（1-based）', minimum: 1 },
                        expected: { type: 'string', description: '当前行的期望内容（用于验证）' },
                        newContent: { type: 'string', description: '新的行内容' }
                    },
                    required: ['path', 'line', 'expected', 'newContent']
                }
            }
        },

        permission: {
            executionPolicy: 'ask-always',
            resultApprovalPolicy: 'always'
        },

        execute: async (args: {
            path: string;
            line: number;
            expected: string;
            newContent: string;
        }): Promise<ToolExecuteResult> => {
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: 'FS not available' };
            }

            const { fs, path } = vfs.route(args.path);
            const filePath = fs.resolve(path);
            if (!await fs.exists(filePath)) {
                return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };
            }

            try {
                const content = await fs.readFile(filePath);
                const lines = content.split('\n');
                const idx = args.line - 1;

                if (idx < 0 || idx >= lines.length) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `行号越界: 文件有 ${lines.length} 行，请求第 ${args.line} 行`
                    };
                }

                const normalize = (s: string) => s.trim().replace(/\s+/g, ' ');
                if (normalize(lines[idx]) !== normalize(args.expected)) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `第 ${args.line} 行内容不匹配\n期望: "${args.expected}"\n实际: "${lines[idx]}"`
                    };
                }

                lines[idx] = args.newContent;
                await fs.writeFile(filePath, lines.join('\n'));

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: { file: fs.basename(filePath), line: args.line }
                };
            } catch (error: any) {
                return { status: ToolExecuteStatus.ERROR, error: error.message };
            }
        },

        formatForLLM: (data: any) => `✓ ${data.file}:${data.line} 已替换`
    };

    const writeFileTool: Tool = {
        definition: {
            type: 'function',
            function: {
                name: 'fs-WriteFile',
                description: '写入完整文件内容。适用于：(1) 创建新文件 (2) 大规模重写（>50% 变更）',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '文件路径' },
                        content: { type: 'string', description: '完整的文件内容' },
                        mode: {
                            type: 'string',
                            enum: ['append', 'overwrite', 'create'],
                            description: '写入模式：create（默认，文件存在报错）、overwrite（覆盖）、append（追加）'
                        }
                    },
                    required: ['path', 'content']
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
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
            }

            const mode = args.mode || 'create';

            try {
                const { fs, path } = vfs.route(args.path);
                const filePath = fs.resolve(path);
                const exists = await fs.exists(filePath);

                if (mode === 'create' && exists) {
                    return { status: ToolExecuteStatus.ERROR, error: `文件已存在: ${filePath}，请使用 mode: 'overwrite'` };
                }

                let content = args.content;
                if (mode === 'append' && exists) {
                    const existing = await fs.readFile(filePath);
                    content = existing + '\n' + args.content;
                }

                await fs.writeFile(filePath, content);

                return {
                    status: ToolExecuteStatus.SUCCESS,
                    data: {
                        file: fs.basename(filePath),
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

    return [searchReplaceTool, applyDiffTool, writeFileTool];
}

export const editorToolsRulePrompt = `
## 文件编辑工具使用指南

### 工具选择策略

| 场景 | 推荐工具 | 说明 |
|------|----------|------|
| 修改 1-3 处代码 | SearchReplace | 最可靠，基于内容匹配；可能更消耗 Token |
| 熟悉 diff 格式 | ApplyDiff | 同样基于内容匹配，忽略 header 行号 |
| 新建文件/大改 | WriteFile | 超过 50% 变更时使用 |


### ApplyDiff 工具

**格式**：
\`\`\`diff
@@ ... @@
 function foo() {
   const x = 1;
-  return x + 1;
+  return x + 2;
 }
\`\`\`

**要点**：
- Header 写 \`@@ ... @@\` 即可，无需计算行号
- 上下文行（空格开头）建议 3-5 行
- 工具通过内容自动定位

### SearchReplace 工具

**格式**：
\`\`\`
<<<<<<< SEARCH
// 包含 3-5 行上下文
function example() {
  const x = 1;
  return x;
}
=======
function example() {
  const x = 2;
  return x * 2;
}
>>>>>>> REPLACE
\`\`\`

**关键规则**：
1. SEARCH 必须是文件中**实际存在**的代码（精确匹配）
2. 包含 3-5 行上下文确保唯一性
3. 多处修改写多个 SEARCH/REPLACE 块
4. REPLACE 留空表示删除

**重复代码处理**：
- 使用 \`withinRange: { startLine: 100, endLine: 200 }\`
- 或增加更多上下文行


### 错误处理流程

**错误类型 1：未找到匹配**
- 原因：SEARCH 内容与文件不符
- 处理：先用 ReadFile 查看实际内容，复制粘贴到 SEARCH

**错误类型 2：发现相似代码（非精确匹配）**
- 工具会显示相似代码的位置和内容
- **必须**先用 ReadFile 查看文件
- 用文件中的实际代码重新提交
- **禁止**凭记忆修改或猜测内容

**错误类型 3：多个匹配位置**
- 增加上下文行（如改为 5-7 行）
- 或使用 withinRange 限定范围

### 最佳实践

✅ **推荐做法**：
- 不确定时先 ReadFile 确认
- 复制文件中的真实代码到 SEARCH
- 保持充足的上下文（3-5 行）

❌ **避免错误**：
- 凭记忆猜测代码内容
- SEARCH 内容有空格/注释差异
- 只写要改的那一行，无上下文
`.trim();
