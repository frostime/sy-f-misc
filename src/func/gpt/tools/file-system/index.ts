/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-11-26 21:47:45
 * @Description  : File System Tools Entry (Updated)
 * @FilePath     : /src/func/gpt/tools/file-system/index.ts
 */
import { mkdirTool, moveFileTool, copyFileTool } from "./shutil";

// --- 变更点：引入新的 viewer 和 editor ---
import { viewerTools } from "./viewer";
import { editorTools } from "./editor";

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');

/**
 * 文件系统工具组 (Viewer + Basic Ops)
 */
export const fileSystemTools = {
    name: '文件系统工具组',
    tools: fs ? [
        ...viewerTools.tools, // View, Search, List, Inspect
        mkdirTool,
        moveFileTool,
        copyFileTool,
    ] : [],
    // 组合 viewerTools 的提示词和其他工具的提示词
    rulePrompt: fs ? `
${viewerTools.rulePrompt}

## 其他文件操作
**基础操作**: Mkdir (创建目录) | MoveFile (移动/重命名) | CopyFile (复制)
`.trim() : ''
};

/**
 * 文件编辑工具组 (Editor)
 */
export const fileEditorTools = {
    name: '文件编辑工具组',
    tools: fs ? [
        ...editorTools.tools // ApplyDiff, ReplaceLine, WriteFile
    ] : [],
    rulePrompt: editorTools.rulePrompt
}

// 动态补充环境信息（保持原有逻辑，适配新 Prompt）
if (fs && fileSystemTools.tools.length > 0) {
    const os = window?.require?.('os');
    const platform = os.platform();
    const homeDir = os.homedir();

    const getWindowsDrives = () => {
        if (platform === 'win32') {
            const drives = [];
            for (let i = 65; i <= 90; i++) {
                const drive = String.fromCharCode(i) + ':\\';
                try {
                    if (fs.existsSync(drive)) drives.push(drive);
                } catch (e) {}
            }
            return drives;
        }
        return [];
    };

    const drivers = getWindowsDrives();
    const drivesStr = drivers.length > 0 ? `, 可用驱动器: ${drivers.join(', ')}` : '';

    // 将环境信息注入到 rulePrompt 头部
    const envInfo = `**当前环境**: ${platform}, 家目录: \`${homeDir}\`${drivesStr}\n\n`;
    fileSystemTools.rulePrompt = envInfo + fileSystemTools.rulePrompt;
}