/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-11-26 21:47:45
 * @Description  : 统一文件系统工具组（查看 + 编辑）
 * @FilePath     : /src/func/gpt/tools/file-system/index.ts
 */
import { isNodeAvailable } from './viewer-utils';
import { viewTool } from './viewer';
import { searchReplaceTool, writeFileTool } from './editor';
import { fileSystemSkillRules } from './skill-rules';
import { getPlatform, getScriptName } from '@/libs/system-utils';
import type { ToolGroup } from '../types';

// const nodePath: typeof import('path') = window?.require?.('path');
const os: typeof import('os') = window?.require?.('os');

/**
 * 创建统一的文件系统工具组
 */
export const createFileSystemToolGroup = (): ToolGroup => {
    const available = isNodeAvailable();

    const tools = available ? [
        // 查看
        viewTool,
        // 编辑
        searchReplaceTool, writeFileTool,
    ] : [];

    let rulePrompt = '';
    if (available && tools.length > 0) {
        rulePrompt = `

**最佳实践**
- 所有 Path 统一使用 Linux / 分隔符
    「×」H:\\File.txt 「√」H:/File.txt
- 文本文件(代码)修改用 SearchReplace，新建/大改用 WriteFile
- 避免对大文件使用 View full 模式，优先用 head/tail/range
- fs-WriteFile 明确指定 "写入模式"
`.trim();

        // 环境信息
        if (os) {
            const platform = getPlatform();
            const homedir = os.homedir?.() || '';
            rulePrompt += `\n\n**环境信息**\n- OS: ${platform}\n- Shell: ${getScriptName()}\n- Home: ${homedir}`;
        }
    }

    return {
        name: '文件系统工具组',
        tools,
        declareSkillRules: fileSystemSkillRules,
        rulePrompt
    };
};
