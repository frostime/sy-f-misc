/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-16 00:00:00
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/resolve-tools.ts
 * @Description  : Script discovery and parsing logic
 */

import { thisPlugin } from '@frostime/siyuan-plugin-kits';
import {
    getScriptPath,
    listPythonScripts,
    listPowerShellScripts,
    listToolJsonFiles,
    getFileModifiedTime,
    fileExists,
    readJsonFile,
    createTempRunDir,
    cleanupTempDir
} from './utils';
import { putFile } from '@/api';
import { globalMiscConfigs } from '../../model/store';
import { ToolDefinitionWithPermission } from '../types';

const fs = window?.require?.('fs');
const path = window?.require?.('path');
const childProcess = window?.require?.('child_process');
const process = window?.require?.('process') || (window as any).process;

/**
 * 获取自定义脚本环境变量
 */
export const getEnvVars = () => {
    const envStr = globalMiscConfigs().CustomScriptEnvVars || '';
    const env = { ...(process?.env || {}) }; // Start with existing env
    const lines = envStr.split('\n');
    for (const line of lines) {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (match) {
            env[match[1]] = match[2].trim();
        }
    }
    return env;
}

/**
 * 解析后的工具模块（扩展支持 PowerShell）
 */
export interface ParsedToolModule {
    scriptName: string;
    scriptPath: string;
    toolJsonPath: string;
    scriptType: 'python' | 'powershell';
    moduleData: {
        type: 'PythonModule' | 'PowerShellModule';
        name: string;
        scriptPath: string;
        tools: IToolDefinition[];
        rulePrompt?: string;
        defaultPermissions?: Pick<ToolDefinitionWithPermission, 'permissionLevel' | 'requireExecutionApproval' | 'requireResultApproval'>;
    };
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
 * 获取 ps2tool.ps1 脚本路径
 */
const getPs2ToolPath = (): string => {
    const plugin = thisPlugin();
    const pluginDir = window.siyuan.config.system.dataDir + `/plugins/${plugin.name}`;
    return path.join(pluginDir, 'scripts/ps2tool.ps1');
};

export const checkSyncIgnore = async () => {
    const syncignorePath = '.siyuan/syncignore';
    const requiredIgnores = [
        'snippets/fmisc-custom-toolscripts/__pycache__/**',
        // 'snippets/fmisc-custom-toolscripts/.git/**'
    ];

    const ignoreFilePath = path.join(window.siyuan.config.system.dataDir, syncignorePath);

    if (!fileExists(ignoreFilePath)) {
        // 文件不存在，创建默认配置
        const defaultIgnores = requiredIgnores.join('\n');

        const blob = new Blob([defaultIgnores], { type: 'text/plain' });
        await putFile('data/' + syncignorePath, false, blob);
        return;
    }

    // 读取现有的 syncignore 文件内容
    const content = fs.readFileSync(ignoreFilePath, 'utf-8');
    const lines = content.split('\n').map(line => line.trim());

    let needsUpdate = false;

    // 检查每个必需的忽略规则是否存在
    for (const ignoreRule of requiredIgnores) {
        if (!lines.includes(ignoreRule)) {
            // 添加缺失的忽略规则
            lines.push(ignoreRule);
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        // 更新文件内容
        const newContent = lines.join('\n');
        const blob = new Blob([newContent], { type: 'text/plain' });
        await putFile('data/' + syncignorePath, false, blob);
    }
}


/**
 * 批量解析多个脚本
 * 使用临时目录进行解析，避免在工作空间生成 .pyc 文件
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
    const tempDir = createTempRunDir();

    try {
        // 复制所有 Python 脚本到临时目录
        const pythonScripts = await listPythonScripts();
        for (const scriptName of pythonScripts) {
            const srcPath = getScriptPath(scriptName);
            const destPath = path.join(tempDir, scriptName);
            fs.copyFileSync(srcPath, destPath);
        }

        return new Promise((resolve) => {
            // 使用 --dir 参数批量解析临时目录，--with-mtime 让其存储修改时间
            const args = ['--dir', tempDir, '--with-mtime'];
            const env = getEnvVars();

            childProcess.execFile('python', [py2toolPath, ...args], { env }, (error, stdout, stderr) => {
                if (error) {
                    cleanupTempDir(tempDir);
                    resolve({
                        success: false,
                        successCount: 0,
                        errors: [{ script: 'all', error: `${error.message}\n${stderr}` }]
                    });
                    return;
                }

                try {
                    // 将生成的 .tool.json 文件复制回原目录
                    const files = fs.readdirSync(tempDir);
                    const toolJsonFiles = files.filter(f => f.endsWith('.tool.json'));

                    for (const jsonFile of toolJsonFiles) {
                        const srcPath = path.join(tempDir, jsonFile);
                        const destPath = getScriptPath(jsonFile);
                        fs.copyFileSync(srcPath, destPath);
                    }

                    console.log('py2tool.py batch output:', stdout);
                    console.log(`成功解析 ${toolJsonFiles.length} 个脚本，JSON 文件已复制回工作目录`);

                    resolve({
                        success: true,
                        successCount: scriptPaths.length,
                        errors: []
                    });
                } catch (copyError) {
                    resolve({
                        success: false,
                        successCount: 0,
                        errors: [{ script: 'all', error: `复制结果文件失败: ${copyError.message}` }]
                    });
                } finally {
                    cleanupTempDir(tempDir);
                }
            });
        });
    } catch (error) {
        cleanupTempDir(tempDir);
        return {
            success: false,
            successCount: 0,
            errors: [{ script: 'all', error: `准备临时目录失败: ${error.message}` }]
        };
    }
};

/**
 * 加载工具定义 JSON 文件
 */
const loadToolDefinition = async (toolJsonPath: string): Promise<(ParsedToolModule['moduleData'] & { lastModified?: number }) | null> => {
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
 * 扫描所有自定义脚本并加载工具定义（不检查时间戳，直接加载）
 */
export const scanCustomScripts = async (): Promise<ParsedToolModule[]> => {
    //必须确保 pycache 被 syncignore 忽略
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
            scriptType: 'python',
            toolJsonPath,
            moduleData,
            lastModified
        });
    }

    return modules;
};

/**
 * 智能扫描自定义脚本：检查时间戳，只在需要时重新解析
 * @returns 返回加载的模块和重新解析的数量
 */
export const scanCustomScriptsWithSmartLoad = async (): Promise<{
    modules: ParsedToolModule[];
    reparsedCount: number;
}> => {
    await checkSyncIgnore();

    const pythonScripts = await listPythonScripts();
    const scriptsToParse: string[] = [];
    const modules: ParsedToolModule[] = [];

    // 首先检查所有脚本，看哪些需要重新解析
    for (const scriptName of pythonScripts) {
        const scriptPath = getScriptPath(scriptName);
        const toolJsonPath = scriptPath.replace('.py', '.tool.json');

        let needReparse = false;

        if (!fileExists(toolJsonPath)) {
            // JSON 文件不存在，需要解析
            needReparse = true;
        } else {
            // JSON 文件存在，检查时间戳
            const moduleData = await loadToolDefinition(toolJsonPath);
            if (moduleData && moduleData.lastModified !== undefined) {
                const currentScriptTime = getFileModifiedTime(scriptPath);
                if (currentScriptTime > moduleData.lastModified) {
                    // 脚本比 JSON 中记录的时间新，需要重新解析
                    needReparse = true;
                }
            } else {
                // JSON 文件格式不正确或没有时间戳，需要重新解析
                needReparse = true;
            }
        }

        if (needReparse) {
            scriptsToParse.push(scriptPath);
        }
    }

    // 如果有需要重新解析的脚本，执行解析
    if (scriptsToParse.length > 0) {
        console.log(`检测到 ${scriptsToParse.length} 个脚本需要重新解析`);
        await parseAllScripts(scriptsToParse);
    }

    // 加载所有工具定义
    const toolJsonFiles = await listToolJsonFiles();
    for (const jsonFile of toolJsonFiles) {
        const toolJsonPath = getScriptPath(jsonFile);
        const moduleData = await loadToolDefinition(toolJsonPath);

        if (!moduleData) {
            continue;
        }

        const scriptName = jsonFile.replace('.tool.json', '.py');
        const scriptPath = getScriptPath(scriptName);

        if (!fileExists(scriptPath)) {
            console.warn('Python script not found for tool definition:', scriptPath);
            continue;
        }

        const lastModified = getFileModifiedTime(scriptPath);

        modules.push({
            scriptName,
            scriptPath,
            toolJsonPath,
            scriptType: scriptName.endsWith('.py') ? 'python' : 'powershell',
            moduleData: {
                type: moduleData.type,
                name: moduleData.name,
                scriptPath: moduleData.scriptPath,
                tools: moduleData.tools,
                rulePrompt: moduleData.rulePrompt
            },
            lastModified
        });
    }

    return {
        modules,
        reparsedCount: scriptsToParse.length
    };
};

/**
 * 检查脚本是否需要重新解析（.py 文件比 .tool.json 文件新）
 */
const checkNeedReparse = (scriptPath: string, toolJsonPath: string): boolean => {
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

/**
 * 批量解析 PowerShell 脚本
 */
export const parseAllPowerShellScripts = async (scriptPaths: string[]): Promise<{
    success: boolean;
    successCount: number;
    errors: Array<{ script: string; error: string }>;
}> => {
    if (scriptPaths.length === 0) {
        return { success: true, successCount: 0, errors: [] };
    }

    const ps2toolPath = getPs2ToolPath();
    const tempDir = createTempRunDir();

    try {
        // 复制脚本到临时目录
        const psScripts = await listPowerShellScripts();
        for (const scriptName of psScripts) {
            const srcPath = getScriptPath(scriptName);
            const destPath = path.join(tempDir, scriptName);
            fs.copyFileSync(srcPath, destPath);
        }

        return new Promise((resolve) => {
            const command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps2toolPath}" -Dir "${tempDir}" -WithMtime`;

            childProcess.exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    cleanupTempDir(tempDir);
                    resolve({
                        success: false,
                        successCount: 0,
                        errors: [{ script: 'all', error: `${error.message}\n${stderr}` }]
                    });
                    return;
                }

                try {
                    // 复制生成的 .tool.json 回原目录
                    const files = fs.readdirSync(tempDir);
                    const toolJsonFiles = files.filter(f => f.endsWith('.tool.json'));

                    for (const jsonFile of toolJsonFiles) {
                        const srcPath = path.join(tempDir, jsonFile);
                        const destPath = getScriptPath(jsonFile);
                        fs.copyFileSync(srcPath, destPath);
                    }

                    console.log('ps2tool.ps1 output:', stdout);
                    resolve({
                        success: true,
                        successCount: scriptPaths.length,
                        errors: []
                    });
                } catch (copyError) {
                    resolve({
                        success: false,
                        successCount: 0,
                        errors: [{ script: 'all', error: `复制结果失败: ${copyError.message}` }]
                    });
                } finally {
                    cleanupTempDir(tempDir);
                }
            });
        });
    } catch (error) {
        cleanupTempDir(tempDir);
        return {
            success: false,
            successCount: 0,
            errors: [{ script: 'all', error: error.message }]
        };
    }
};

/**
 * 智能扫描所有自定义脚本（Python + PowerShell）
 */
export const scanAllCustomScriptsWithSmartLoad = async (): Promise<{
    modules: ParsedToolModule[];
    reparsedCount: number;
}> => {
    await checkSyncIgnore();

    const pythonScripts = await listPythonScripts();
    const powerShellScripts = await listPowerShellScripts();

    const pythonToParse: string[] = [];
    const psToParse: string[] = [];
    const modules: ParsedToolModule[] = [];

    // 检查 Python 脚本
    for (const scriptName of pythonScripts) {
        const scriptPath = getScriptPath(scriptName);
        const toolJsonPath = scriptPath.replace('.py', '.tool.json');

        if (needsReparse(scriptPath, toolJsonPath)) {
            pythonToParse.push(scriptPath);
        }
    }

    // 检查 PowerShell 脚本
    for (const scriptName of powerShellScripts) {
        const scriptPath = getScriptPath(scriptName);
        const toolJsonPath = scriptPath.replace('.ps1', '.tool.json');

        if (needsReparse(scriptPath, toolJsonPath)) {
            psToParse.push(scriptPath);
        }
    }

    // 执行解析
    if (pythonToParse.length > 0) {
        console.log(`解析 ${pythonToParse.length} 个 Python 脚本`);
        await parseAllScripts(pythonToParse);
    }

    if (psToParse.length > 0) {
        console.log(`解析 ${psToParse.length} 个 PowerShell 脚本`);
        await parseAllPowerShellScripts(psToParse);
    }

    // 加载所有工具定义
    const toolJsonFiles = await listToolJsonFiles();
    for (const jsonFile of toolJsonFiles) {
        const toolJsonPath = getScriptPath(jsonFile);
        const moduleData = await loadToolDefinition(toolJsonPath);

        if (!moduleData) continue;

        // 确定脚本类型
        const isPython = moduleData.type === 'PythonModule';
        const scriptExt = isPython ? '.py' : '.ps1';
        const scriptName = jsonFile.replace('.tool.json', scriptExt);
        const scriptPath = getScriptPath(scriptName);

        if (!fileExists(scriptPath)) {
            console.warn(`脚本文件不存在: ${scriptPath}`);
            continue;
        }

        modules.push({
            scriptName,
            scriptPath,
            toolJsonPath,
            scriptType: isPython ? 'python' : 'powershell',
            moduleData,
            lastModified: getFileModifiedTime(scriptPath)
        });
    }

    return {
        modules,
        reparsedCount: pythonToParse.length + psToParse.length
    };
};

function needsReparse(scriptPath: string, toolJsonPath: string): boolean {
    if (!fileExists(toolJsonPath)) return true;

    try {
        const jsonContent = fs.readFileSync(toolJsonPath, 'utf-8');
        const data = JSON.parse(jsonContent);

        if (data.lastModified !== undefined) {
            const currentScriptTime = getFileModifiedTime(scriptPath);
            return currentScriptTime > data.lastModified;
        }
    } catch {
        // 解析失败，需要重新解析
    }

    return true;
}
