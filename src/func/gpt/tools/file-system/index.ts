/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-11-26 21:47:45
 * @Description  : 统一文件系统工具组（查看 + 搜索 + 编辑 + 文件操作）
 * @FilePath     : /src/func/gpt/tools/file-system/index.ts
 */
import { isNodeAvailable } from './viewer-utils';
import { viewTool, listTool, inspectTool } from './viewer';
import { searchReplaceTool, writeFileTool, editorRulePrompt } from './editor';
import { shellTools } from './shell';
import { getPlatform, getScriptName } from '@/libs/system-utils';
import type { ToolGroup } from '../types';

const nodePath: typeof import('path') = window?.require?.('path');
const os: typeof import('os') = window?.require?.('os');

/**
 * 创建统一的文件系统工具组
 */
export const createFileSystemToolGroup = (): ToolGroup => {
    const available = isNodeAvailable();

    const tools = available ? [
        // 查看
        viewTool, listTool, inspectTool,
        // Shell 搜索 + 文件操作
        ...shellTools,
        // 编辑
        searchReplaceTool, writeFileTool,
    ] : [];

    let rulePrompt = '';
    if (available && tools.length > 0) {
        rulePrompt = `
## 文件系统工具组

### 查看工具
- **fs-View** - 智能文件查看（full/head/tail/range 模式，自动处理大文件）
- **fs-List** - 目录树展示（深度/过滤控制）
- **fs-Inspect** - 文件元信息（大小、行数、类型）

### 搜索工具
- **fs-Glob** - 按文件名搜索（底层 ${getScriptName() === 'PowerShell' ? 'Get-ChildItem' : 'find'}，高性能）
- **fs-Grep** - 按内容搜索（底层 ${getScriptName() === 'PowerShell' ? 'Select-String' : 'grep -rn'}，支持正则）

### 文件操作
- **fs-FileOps** - 受限 ${getScriptName()} Shell（仅允许文件操作命令：mkdir, cp, mv, rm 等）

${editorRulePrompt}

### 最佳实践
- 不确定文件类型/大小时，先用 Inspect 检查
- 搜索文件名用 Glob，搜索内容用 Grep
- 批量文件操作（创建目录、复制、移动、删除等）使用 fs-FileOps
- 代码修改用 SearchReplace，新建/大改用 WriteFile
- 避免对大文件使用 View full 模式，优先用 head/tail/range
`.trim();

        // 环境信息
        if (os) {
            const platform = getPlatform();
            const homedir = os.homedir?.() || '';
            rulePrompt += `\n\n### 环境信息\n- OS: ${platform}\n- Shell: ${getScriptName()}\n- Home: ${homedir}`;
        }
    }

    return { name: '文件系统工具组', tools, rulePrompt };
};
