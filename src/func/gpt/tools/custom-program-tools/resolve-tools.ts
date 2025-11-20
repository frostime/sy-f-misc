/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-16 00:00:00
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/resolve-tools.ts
 * @Description  : Script discovery and parsing logic
 */

import { thisPlugin } from '@frostime/siyuan-plugin-kits';
import {
    getCustomScriptsDir,
    getScriptPath,
    listPythonScripts,
    listToolJsonFiles,
    getFileModifiedTime,
    fileExists,
    readJsonFile
} from './utils';

const fs = window?.require?.('fs');
const path = window?.require?.('path');
const childProcess = window?.require?.('child_process');

/**
 * 解析后的工具模块
 */
export interface ParsedToolModule {
    // Python 脚本文件名
    scriptName: string;
    // Python 脚本完整路径
    scriptPath: string;
    // .tool.json 文件路径
    toolJsonPath: string;
    // 模块数据（从 .tool.json 加载）
    moduleData: {
        type: 'PythonModule';
        name: string;
        scriptPath: string;
        tools: IToolDefinition[];
        rulePrompt?: string;
    };
    // 脚本文件最后修改时间
    lastModified: number;
}

/**
 * 获取 py2tool.py 脚本的路径
 */
const getPy2ToolPath = (): string => {
    const plugin = thisPlugin();
    // py2tool.py 位于插件的 public/scripts/ 目录下
    const pluginDir = window.siyuan.config.system.dataDir + `/plugins/${plugin.name}`;
    const scriptPath = path.join(pluginDir, 'scripts/py2tool.py');
    return path.resolve(scriptPath);
};

/**
 * 调用 py2tool.py 解析 Python 脚本
 */
export const parseScriptWithPy2Tool = async (scriptPath: string): Promise<{
    success: boolean;
    error?: string;
}> => {
    const py2toolPath = getPy2ToolPath();

    return new Promise((resolve) => {
        const args = ['--files', scriptPath];

        childProcess.execFile('python', [py2toolPath, ...args], (error, stdout, stderr) => {
            if (error) {
                resolve({
                    success: false,
                    error: `Failed to parse script: ${error.message}\n${stderr}`
                });
                return;
            }

            console.log('py2tool.py output:', stdout);

            resolve({
                success: true
            });
        });
    });
};


export const checkSyncIgnore = async () => {
    const ignoreFilePath = path.join(window.siyuan.config.system.dataDir, '.siyuan', 'syncignore');
    if (!fileExists(ignoreFilePath)) {
        // 创建 syncignore 文件
        const defaultIgnores = [
            'snippets/fmisc-custom-toolscripts/__pycache__/**',
        ].join('\n');

        fs.writeFileSync(ignoreFilePath, defaultIgnores, 'utf-8');
        return;
    }
    // 读取现有的 syncignore 文件内容
    const content = fs.readFileSync(ignoreFilePath, 'utf-8');
    const lines = content.split('\n').map(line => line.trim());
    const requiredIgnore = 'snippets/fmisc-custom-toolscripts/__pycache__/**';

    if (!lines.includes(requiredIgnore)) {
        // 添加缺失的忽略规则
        lines.push(requiredIgnore);
        fs.writeFileSync(ignoreFilePath, lines.join('\n'), 'utf-8');
        return;
    }
}

/**
 * 批量解析多个脚本
 */
export const parseAllScripts = async (scriptPaths: string[]): Promise<{
    success: boolean;
    successCount: number;
    errors: Array<{ script: string; error: string }>;
}> => {
    if (scriptPaths.length === 0) {
        return { success: true, successCount: 0, errors: [] };
    }

    const py2toolPath = getPy2ToolPath();
    const scriptsDir = getCustomScriptsDir();

    return new Promise((resolve) => {
        // 使用 --dir 参数批量解析整个目录
        const args = ['--dir', scriptsDir];

        childProcess.execFile('python', [py2toolPath, ...args], (error, stdout, stderr) => {
            if (error) {
                resolve({
                    success: false,
                    successCount: 0,
                    errors: [{ script: 'all', error: `${error.message}\n${stderr}` }]
                });
                return;
            }

            console.log('py2tool.py batch output:', stdout);

            resolve({
                success: true,
                successCount: scriptPaths.length,
                errors: []
            });
        });
    });
};

/**
 * 加载工具定义 JSON 文件
 */
const loadToolDefinition = async (toolJsonPath: string): Promise<ParsedToolModule['moduleData'] | null> => {
    try {
        const data = await readJsonFile(toolJsonPath);

        // 验证必要字段
        if (!data.type || !data.name || !Array.isArray(data.tools)) {
            console.warn('Invalid tool definition format:', toolJsonPath);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Failed to load tool definition:', toolJsonPath, error);
        return null;
    }
};

/**
 * 扫描所有自定义脚本并加载工具定义
 */
export const scanCustomScripts = async (): Promise<ParsedToolModule[]> => {
    //必须确保 pycache 被 syncignore 忽略; 在
    await checkSyncIgnore();
    const toolJsonFiles = await listToolJsonFiles();
    const modules: ParsedToolModule[] = [];

    for (const jsonFile of toolJsonFiles) {
        const toolJsonPath = getScriptPath(jsonFile);
        const moduleData = await loadToolDefinition(toolJsonPath);

        if (!moduleData) {
            continue;
        }

        // 提取对应的 .py 文件名
        const scriptName = jsonFile.replace('.tool.json', '.py');
        const scriptPath = getScriptPath(scriptName);

        // 检查 .py 文件是否存在
        if (!fileExists(scriptPath)) {
            console.warn('Python script not found for tool definition:', scriptPath);
            continue;
        }

        const lastModified = getFileModifiedTime(scriptPath);

        modules.push({
            scriptName,
            scriptPath,
            toolJsonPath,
            moduleData,
            lastModified
        });
    }

    return modules;
};

/**
 * 检查脚本是否需要重新解析（.py 文件比 .tool.json 文件新）
 */
export const checkNeedReparse = (scriptPath: string, toolJsonPath: string): boolean => {
    if (!fileExists(toolJsonPath)) {
        return true;
    }

    const scriptTime = getFileModifiedTime(scriptPath);
    const jsonTime = getFileModifiedTime(toolJsonPath);

    return scriptTime > jsonTime;
};

/**
 * 重新解析所有需要更新的脚本
 */
export const reparseOutdatedScripts = async (): Promise<{
    success: boolean;
    parsedCount: number;
    errors: Array<{ script: string; error: string }>;
}> => {
    const pythonScripts = await listPythonScripts();
    const scriptsToParse: string[] = [];

    for (const scriptName of pythonScripts) {
        const scriptPath = getScriptPath(scriptName);
        const toolJsonPath = scriptPath.replace('.py', '.tool.json');

        if (checkNeedReparse(scriptPath, toolJsonPath)) {
            scriptsToParse.push(scriptPath);
        }
    }

    if (scriptsToParse.length === 0) {
        return { success: true, parsedCount: 0, errors: [] };
    }

    console.log(`Reparsing ${scriptsToParse.length} outdated scripts...`);
    const result = await parseAllScripts(scriptsToParse);
    return {
        success: result.success,
        parsedCount: result.successCount,
        errors: result.errors
    };
};
