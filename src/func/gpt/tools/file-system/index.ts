/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-11-26 21:47:45
 * @Description  : 统一文件系统工具组（查看 + 搜索 + 编辑 + 文件操作）
 * @FilePath     : /src/func/gpt/tools/file-system/index.ts
 */
import { isNodeAvailable } from './viewer-utils';
import { viewTool, listTool, inspectTool } from './viewer';
import { searchReplaceTool, writeFileTool } from './editor';
import { shellTools } from './shell';
import { fileSystemSkillRules } from './skill-rules';
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

### 文件系统工具选择指南

| 需要做什么 | 用哪个工具 |
|-----------|-----------|
| 查看文件内容 | **fs-View** (支持 full/head/tail/range) |
| 查看目录结构 | **fs-List** (树形展示) |
| 检查文件元信息 | **fs-Inspect** (类型/大小/行数) |
| 按文件名找文件 | **fs-Glob** (底层 find/Get-ChildItem) |
| 在文件内容中搜索 | **fs-Grep** (底层 grep/Select-String) |
| 修改 1-N 处代码 | **fs-SearchReplace** (内容匹配替换) |
| 新建文件 / 大改 | **fs-WriteFile** (>50% 变更时) |
| mkdir/cp/mv/rm 等 | **fs-FileOps** (受限 Shell 白名单) |

### 最佳实践
- 所有 Path 统一使用 Linux / 分隔符
    「×」H:\\File.txt 「√」H:/File.txt
- 未知目录使用 fs-List 分析结构
- 搜索文件名用 Glob，搜索内容用 Grep
- 批量文件操作使用 fs-FileOps
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

    return {
        name: '文件系统工具组',
        tools,
        declareSkillRules: fileSystemSkillRules,
        rulePrompt
    };
};
