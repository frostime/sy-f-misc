import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

const fs = window?.require?.('fs');
const path = window?.require?.('path');

/**
 * Unified Diff Hunk 结构（简化版）
 */
interface DiffHunk {
    oldStart: number;   // 旧文件起始行号（1-based）
    oldLines: number;   // 旧文件涉及的行数
    newStart: number;   // 新文件起始行号（1-based）
    newLines: number;   // 新文件涉及的行数
    oldContent: string[]; // 旧文件的完整内容（包含上下文和待删除行）
    newContent: string[]; // 新文件的完整内容（包含上下文和新增行）
    header?: string;    // 可选的 hunk header（如函数名）
}

/**
 * 解析 Unified Diff
 * 
 * 核心逻辑：
 * - 空格/空行 开头 → 同时加入 oldContent 和 newContent（上下文）
 * - `-` 开头 → 仅加入 oldContent（待删除）
 * - `+` 开头 → 仅加入 newContent（新增）
 */
function parseUnifiedDiff(diffText: string): DiffHunk[] {
    const lines = diffText.split('\n');
    const hunks: DiffHunk[] = [];
    let current: DiffHunk | null = null;

    for (const line of lines) {
        // 匹配 hunk header: @@ -l,s +l,s @@
        const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/);

        if (match) {
            // 保存上一个 hunk
            if (current) hunks.push(current);

            // 创建新 hunk
            current = {
                oldStart: parseInt(match[1]),
                oldLines: parseInt(match[2] || '1'),
                newStart: parseInt(match[3]),
                newLines: parseInt(match[4] || '1'),
                oldContent: [],
                newContent: [],
                header: match[5]?.trim() || undefined
            };
            continue;
        }

        if (!current) continue;

        // 解析内容行
        if (line.startsWith(' ') || line === '') {
            // 上下文行：同时存在于旧文件和新文件
            const content = line.startsWith(' ') ? line.substring(1) : '';
            current.oldContent.push(content);
            current.newContent.push(content);
        } else if (line.startsWith('-')) {
            // 删除行：仅存在于旧文件
            current.oldContent.push(line.substring(1));
        } else if (line.startsWith('+')) {
            // 新增行：仅存在于新文件
            current.newContent.push(line.substring(1));
        }
        // 其他行（如 diff header）忽略
    }

    if (current) hunks.push(current);
    return hunks;
}

/**
 * 验证 hunk 是否可以应用到文件
 * 
 * @param fileLines 文件的所有行
 * @param hunk 要验证的 hunk
 * @param fuzzy 是否启用模糊匹配（忽略空白符差异）
 */
function verifyHunk(
    fileLines: string[],
    hunk: DiffHunk,
    fuzzy: boolean = true
): { success: boolean; error?: string } {
    const startIdx = hunk.oldStart - 1; // 转为 0-based

    // 检查边界
    if (startIdx < 0 || startIdx + hunk.oldLines > fileLines.length) {
        return {
            success: false,
            error: `行号越界：文件有 ${fileLines.length} 行，hunk 要求从第 ${hunk.oldStart} 行开始取 ${hunk.oldLines} 行`
        };
    }

    // 检查行数是否匹配预期
    if (hunk.oldContent.length !== hunk.oldLines) {
        return {
            success: false,
            error: `Hunk 内部不一致：header 声明 ${hunk.oldLines} 行，实际解析到 ${hunk.oldContent.length} 行`
        };
    }

    // 逐行验证
    const normalize = (s: string) => fuzzy ? s.trim().replace(/\s+/g, ' ') : s;

    for (let i = 0; i < hunk.oldLines; i++) {
        const expected = normalize(hunk.oldContent[i]);
        const actual = normalize(fileLines[startIdx + i] || '');

        if (expected !== actual) {
            return {
                success: false,
                error: [
                    `第 ${hunk.oldStart + i} 行内容不匹配`,
                    `期望: "${hunk.oldContent[i]}"`,
                    `实际: "${fileLines[startIdx + i] || ''}"`
                ].join('\n')
            };
        }
    }

    return { success: true };
}

/**
 * 应用单个 hunk
 * 
 * 核心操作：splice(startIdx, oldLines, ...newContent)
 */
function applyHunk(fileLines: string[], hunk: DiffHunk): string[] {
    const startIdx = hunk.oldStart - 1;
    const result = [...fileLines];

    // ✅ 关键修复：使用 oldLines 而非手动计算
    result.splice(startIdx, hunk.oldLines, ...hunk.newContent);

    return result;
}

// ============================================================
// Tool Definitions
// ============================================================

/**
 * ApplyDiff 工具
 */
export const applyDiffTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs.ApplyDiff',
            description: `应用 Unified Diff 格式的补丁到文件。支持一次修改多处（多个 @@ hunk）

**Header 计算规则 (重要！)**：
\`@@ -oldStart,oldLines +newStart,newLines @@\`

计算方法：
1. 数 **空格开头** 和 **空行** → 上下文行数 (C)
2. 数 **-** 开头 → 删除行数 (D)  
3. 数 **+** 开头 → 新增行数 (A)
4. oldLines = C + D
5. newLines = C + A

**示例**：
\`\`\`diff
@@ -5,5 +5,3 @@
 function foo() {     # 上下文 (1)
-  const x = 1;       # 删除 (1)
-  const y = 2;       # 删除 (2)
-  return x + y;      # 删除 (3)
+  return 3;          # 新增 (1)
 }                    # 上下文 (2)
\`\`\`
上下文=2, 删除=3, 新增=1
→ oldLines=2+3=5, newLines=2+1=3
→ Header: \`@@ -5,5 +5,3 @@\`
`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径'
                    },
                    diff: {
                        type: 'string',
                        description: 'Unified diff 内容（可包含多个 @@ hunk）'
                    },
                    fuzzy: {
                        type: 'boolean',
                        description: '是否启用模糊匹配（忽略空白符差异），默认 true'
                    }
                },
                required: ['path', 'diff']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: {
        path: string;
        diff: string;
        fuzzy?: boolean;
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '当前环境不支持文件系统操作'
            };
        }

        const filePath = path.resolve(args.path);
        const useFuzzy = args.fuzzy ?? true;

        if (!fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件不存在: ${filePath}`
            };
        }

        try {
            // 1. 读取文件
            const content = fs.readFileSync(filePath, 'utf-8');
            let lines = content.split('\n');

            // 2. 解析 diff
            const hunks = parseUnifiedDiff(args.diff);

            if (hunks.length === 0) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: '未找到有效的 diff hunk（需要以 @@ 开头）'
                };
            }

            // 3. 逆序应用（从文件末尾向前，避免行号偏移影响）
            const sorted = [...hunks].sort((a, b) => b.oldStart - a.oldStart);

            for (const hunk of sorted) {
                // 验证
                const check = verifyHunk(lines, hunk, useFuzzy);
                if (!check.success) {
                    return {
                        status: ToolExecuteStatus.ERROR,
                        error: `Hunk 应用失败（起始行 ${hunk.oldStart}）:\n${check.error}`
                    };
                }

                // 应用
                lines = applyHunk(lines, hunk);
            }

            // 4. 写回文件
            fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

            // 5. 统计变更
            const stats = {
                file: path.basename(filePath),
                hunks: hunks.length,
                removed: hunks.reduce((sum, h) => sum + (h.oldLines - h.oldContent.filter((_, i) => h.newContent[i] === undefined).length), 0),
                added: hunks.reduce((sum, h) => sum + (h.newLines - h.newContent.filter((_, i) => h.oldContent[i] === undefined).length), 0)
            };

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: stats
            };

        } catch (error: any) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Diff 应用失败: ${error.message}`
            };
        }
    },

    formatForLLM: (data: any) => {
        return `✓ ${data.file}: 应用了 ${data.hunks} 个 hunk (-${data.removed} +${data.added})`;
    }
};

/**
 * ReplaceLine 工具：单行快速替换
 */
export const replaceLineTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs.ReplaceLine',
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
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: {
        path: string;
        line: number;
        expected: string;
        newContent: string;
    }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: 'FS not available' };
        }

        const filePath = path.resolve(args.path);
        if (!fs.existsSync(filePath)) {
            return { status: ToolExecuteStatus.ERROR, error: `文件不存在: ${filePath}` };
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
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
            fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: { file: path.basename(filePath), line: args.line }
            };
        } catch (error: any) {
            return { status: ToolExecuteStatus.ERROR, error: error.message };
        }
    },

    formatForLLM: (data: any) => `✓ ${data.file}:${data.line} 已替换`
};

/**
 * WriteFile 工具：全新写入或重写文件
 */
export const writeFileTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs.WriteFile',
            description: '写入完整文件内容。适用于：(1) 创建新文件 (2) 大规模重写（>50% 变更）',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '文件路径' },
                    content: { type: 'string', description: '完整的文件内容' },
                    mode: { type: 'string', 'enum': ['append', 'overwrite', 'create'], description: '写入模式，追加或覆盖，默认 create; create 会在文件存在时报错, 而 overwrite 会覆盖文件' }
                },
                required: ['path', 'content']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE,
        requireResultApproval: true
    },

    execute: async (args: { path: string; content: string, mode?: 'append' | 'overwrite' | 'create' }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: 'FS not available' };
        }

        const mode = args.mode || 'create';

        try {
            const filePath = path.resolve(args.path);
            const dir = path.dirname(filePath);

            // 确保目录存在
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (mode === 'create' && fs.existsSync(filePath)) {
                return { status: ToolExecuteStatus.ERROR, error: `文件已存在: ${filePath}, 无法 create` };
            }

            let content = args.content;
            if (mode === 'append' && fs.existsSync(filePath)) {
                const existing = fs.readFileSync(filePath, 'utf-8');
                content = existing + '\n' + args.content;
            }

            fs.writeFileSync(filePath, content, 'utf-8');

            return {
                status: ToolExecuteStatus.SUCCESS,
                data: {
                    file: path.basename(filePath),
                    lines: args.content.split('\n').length,
                    bytes: Buffer.byteLength(args.content, 'utf8')
                }
            };
        } catch (error: any) {
            return { status: ToolExecuteStatus.ERROR, error: error.message };
        }
    },

    formatForLLM: (data: any) => `✓ ${data.file}: 已写入 ${data.lines} 行 (${data.bytes} bytes)`
};

/**
 * 导出工具组
 */
export const editorTools = {
    name: '文件编辑工具组',
    tools: fs ? [applyDiffTool, replaceLineTool, writeFileTool] : [],
    rulePrompt: `
## 文件编辑工具使用指南

### 工具选择策略

1. **ApplyDiff** (首选，90% 场景)
   - 适用：几乎所有代码修改
   - 格式：Unified Diff (标准 @@ 格式)
   - 上下文：**2-3 行即可**（除非代码高度重复）
   - 优势：Token 效率最高，支持一次修改多处

2. **ReplaceLine** (快速微调)
   - 适用：单行简单修改（改变量名、修正拼写）
   - 必须：提供原始内容验证

3. **WriteFile** (新建/重写)
   - **新建文件**: 默认模式 (mode='create')，文件存在会报错
   - **完全重写**: 必须指定 \`mode: 'overwrite'\`
   - **追加内容**: 指定 \`mode: 'append'\

### ApplyDiff 最佳实践

**上下文行数选择**：
\`\`\`diff
# 一般情况：2-3 行足够
@@ -42,3 +42,3 @@
 function foo() {
   const x = 1;
-  return x + 1;
+  return x + 2;
 }

# 代码有重复：增加上下文
@@ -42,7 +42,7 @@
 // Component: UserProfile
 function foo() {
   const x = 1;
-  return x + 1;
+  return x + 2;
 }
 // End Component
\`\`\`

**多处修改**：
\`\`\`diff
@@ -10,2 +10,2 @@
 import React from 'react';
-import { Button } from './old';
+import { Button } from './new';

@@ -50,3 +50,3 @@
 function App() {
-  return <OldButton />;
+  return <NewButton />;
 }
\`\`\`

### 操作流程

1. **Read/Search** 定位目标代码
2. **选择工具**：优先 ApplyDiff
3. **构造 Diff**：包含必要上下文
4. **执行**：工具会自动验证并应用
`.trim()
};
