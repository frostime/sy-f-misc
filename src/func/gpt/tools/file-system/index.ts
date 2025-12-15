/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-11-26 21:47:45
 * @Description  : File System Tools Entry (Updated)
 * @FilePath     : /src/func/gpt/tools/file-system/index.ts
 */
import { createShutilTools } from "./shutil-vfs";
import { createViewerTools } from "./viewer-vfs";
import { createEditorTools, editorToolsRulePrompt } from "./editor-vfs";
import { IVFS } from '@/libs/vfs';

/**
 * 文件系统工具组 (Viewer + Basic Ops)
 */
export const createFileSystemToolGroup = (vfs: IVFS) => {
    const viewerTools = createViewerTools(vfs);
    const shutilTools = createShutilTools(vfs);

    const fileSystemTools = {
        name: '文件系统工具组',
        tools: vfs.isAvailable() ? [
            ...viewerTools.tools, // View, Search, List, Inspect
            ...shutilTools,       // Mkdir, MoveFile, CopyFile
        ] : [],
        // 组合 viewerTools 的提示词和其他工具的提示词
        rulePrompt: vfs.isAvailable() ? `
${viewerTools.rulePrompt}

## 其他文件操作
**基础操作**: Mkdir (创建目录) | MoveFile (移动/重命名) | CopyFile (复制)
`.trim() : ''
    };

    // 动态补充环境信息
    if (vfs.isAvailable() && fileSystemTools.tools.length > 0) {
        const os = window?.require?.('os');
        const fs = window?.require?.('fs');

        if (os) {
            const platform = os.platform();
            const homedir = os.homedir();
            // @ts-ignore
            // const cwd = process.cwd();

            let drivesStr = '';
            if (platform === 'win32' && fs) {
                const drives = [];
                for (let i = 65; i <= 90; i++) {
                    const drive = String.fromCharCode(i) + ':\\';
                    try {
                        if (fs.existsSync(drive)) drives.push(drive);
                    } catch (e) { }
                }
                if (drives.length > 0) {
                    drivesStr = `, 可用驱动器: ${drives.join(', ')}`;
                }
            }

            fileSystemTools.rulePrompt += `

## 环境信息
- OS: ${platform}
- Home: ${homedir}
`.trim();
        }
    }
    return fileSystemTools;
}

/**
 * 文件编辑工具组 (Editor)
 */
export const createFileEditorToolGroup = (vfs: IVFS) => {
    const editorTools = createEditorTools(vfs);

    const fileEditorTools = {
        name: '文件编辑工具组',
        tools: vfs.isAvailable() ? [
            ...editorTools // ApplyDiff, ReplaceLine, WriteFile
        ] : [],
        rulePrompt: editorToolsRulePrompt
    }

    return fileEditorTools;
}