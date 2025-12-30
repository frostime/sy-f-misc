/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-16 00:00:00
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/utils.ts
 * @Description  : Custom script tools utility functions
 */

import {
    getTempDir,
    hasCommand,
    execFile as systemExecFile,
    execCommand
} from '@/libs/system-utils';

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');
const path = window?.require?.('path');

const SIYUAN_DATA_DIR = window.siyuan.config.system.dataDir;
const CUSTOM_SCRIPTS_DIR = path?.join(SIYUAN_DATA_DIR, 'snippets', 'fmisc-custom-toolscripts');

/**
 * 获取自定义脚本目录路径
 */
export const getCustomScriptsDir = (): string => {
    return CUSTOM_SCRIPTS_DIR;
};

/**
 * 确保自定义脚本目录存在
 */
export const ensureCustomScriptsDir = async (): Promise<void> => {
    if (!fs.existsSync(CUSTOM_SCRIPTS_DIR)) {
        await fs.promises.mkdir(CUSTOM_SCRIPTS_DIR, { recursive: true });
    }
};

/**
 * 列出自定义脚本目录下的所有 Python 文件
 */
export const listPythonScripts = async (): Promise<string[]> => {
    await ensureCustomScriptsDir();
    const files = await fs.promises.readdir(CUSTOM_SCRIPTS_DIR);
    return files.filter((f: string) => f.endsWith('.py') && !f.startsWith('_'));
};

/**
 * 列出自定义脚本目录下的所有 PowerShell 文件
 */
export const listPowerShellScripts = async (): Promise<string[]> => {
    await ensureCustomScriptsDir();
    const files = await fs.promises.readdir(CUSTOM_SCRIPTS_DIR);
    return files.filter((f: string) => f.endsWith('.ps1') && !f.startsWith('_'));
};

/**
 * 列出所有 .tool.json 文件
 */
export const listToolJsonFiles = async (): Promise<string[]> => {
    await ensureCustomScriptsDir();
    const files = await fs.promises.readdir(CUSTOM_SCRIPTS_DIR);
    return files.filter((f: string) => f.endsWith('.tool.json'));
};

/**
 * 获取脚本的完整路径
 */
export const getScriptPath = (filename: string): string => {
    return path.join(CUSTOM_SCRIPTS_DIR, filename);
};

/**
 * 检查 Python 环境是否可用
 * 复用 system-utils 的 hasCommand 和 execFile
 */
export const checkPythonAvailable = async (): Promise<{
    available: boolean;
    version?: string;
    error?: string;
}> => {
    const hasPython = await hasCommand('python');
    if (!hasPython) {
        return {
            available: false,
            error: 'Python not found in PATH'
        };
    }

    const result = await systemExecFile('python', ['--version']);
    if (!result.success) {
        return {
            available: false,
            error: result.error || 'Failed to get Python version'
        };
    }

    return {
        available: true,
        version: result.stdout || result.stderr
    };
};

/**
 * 检查 PowerShell 是否可用
 * 复用 system-utils 的 execCommand
 */
export const checkPowerShellAvailable = async (): Promise<{
    available: boolean;
    version?: string;
    error?: string;
}> => {
    let command: 'pwsh' | 'powershell' = 'pwsh';
    const hasPwsh = await hasCommand('pwsh');
    if (!hasPwsh) {
        const hasPowershell = await hasCommand('powershell');
        if (!hasPowershell) {
            return {
                available: false,
                error: 'PowerShell not found in PATH'
            };
        }
        command = 'powershell';
    }
    const result = await execCommand(
        `${command} -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`
    );

    if (!result.success) {
        return {
            available: false,
            error: `PowerShell not found: ${result.error}`
        };
    }

    return {
        available: true,
        version: result.stdout
    };
};

/**
 * 创建临时运行目录
 * 复用 system-utils 的 getTempDir
 */
export const createTempRunDir = (): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const baseDir = getTempDir();

    const tempDir = path.join(baseDir, 'siyuan_temp', `run_${timestamp}_${random}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // 规范化路径（避免 Windows 8.3 短文件名）
    try {
        return fs.realpathSync.native?.(tempDir) ?? tempDir;
    } catch {
        return fs.realpathSync(tempDir);
    }
};

/**
 * 清理临时目录
 */
export const cleanupTempDir = (tempDir: string): void => {
    try {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    } catch (error) {
        console.error('Failed to cleanup temp directory:', error);
    }
};

/**
 * 获取文件的修改时间
 */
export const getFileModifiedTime = (filePath: string): number => {
    try {
        const stats = fs.statSync(filePath);
        return stats.mtimeMs;
    } catch {
        return 0;
    }
};

/**
 * 检查文件是否存在
 */
export const fileExists = (filePath: string): boolean => {
    return fs.existsSync(filePath);
};

/**
 * 读取 JSON 文件
 */
export const readJsonFile = async (filePath: string): Promise<any> => {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
};

/**
 * 写入 JSON 文件
 */
export const writeJsonFile = async (filePath: string, data: any): Promise<void> => {
    const content = JSON.stringify(data, null, 4);
    await fs.promises.writeFile(filePath, content, 'utf-8');
};

/**
 * 打开自定义脚本目录
 */
export const openCustomScriptsDir = async (): Promise<void> => {
    await ensureCustomScriptsDir();
    const electron = window?.require?.('electron');
    if (electron?.shell) {
        electron.shell.openPath(CUSTOM_SCRIPTS_DIR);
    }
};
