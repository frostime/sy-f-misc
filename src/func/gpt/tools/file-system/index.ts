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
import { getPlatform, getScriptName } from '@/libs/system-utils';
import type { ToolGroup } from '../types';

// const nodePath: typeof import('path') = window?.require?.('path');
const os: typeof import('os') = window?.require?.('os');

/**
 * 参数 schema 未表达的约定。
 * 读取模式、写入模式、行数上限等已在工具参数描述中，不在此重复。
 */
const PATH_AND_MATCH_CONVENTIONS = `
**约定**
- Path 统一使用 Linux / 分隔符：「×」H:\\File.txt 「√」H:/File.txt
- fs-View 的 full 模式只用于 ≤0.5MB 的文件；更大的文件用 head/tail/range
`.trim();

/**
 * 运行环境信息，模型无法自行推断
 */
const environmentInfo = (): string => {
    if (!os) return '';
    const lines = [`- OS: ${getPlatform()}`, `- Shell: ${getScriptName()}`];
    const home = os.homedir?.();
    if (home) lines.push(`- Home: ${home}`);
    return `**环境信息**\n${lines.join('\n')}`;
};

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

    const rulePrompt = tools.length > 0
        ? [PATH_AND_MATCH_CONVENTIONS, environmentInfo()].filter(Boolean).join('\n\n')
        : '';

    return {
        name: '文件系统工具组',
        tools,
        rulePrompt
    };
};
