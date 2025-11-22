/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-16 00:00:00
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/index.ts
 * @Description  : Custom script tools - main entry point
 */

import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel, ToolGroup } from "../types";
import { scanCustomScriptsWithSmartLoad, ParsedToolModule, getEnvVars } from './resolve-tools';
import { createTempRunDir, cleanupTempDir } from './utils';
import { saveAndTruncate, formatToolResult, normalizeLimit } from '../utils';

const fs = window?.require?.('fs');
const path = window?.require?.('path');
const childProcess = window?.require?.('child_process');

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * 工具执行上下文
 */
interface CustomToolExecutionContext {
    scriptPath: string;
    functionName: string;
    args: Record<string, any>;
    timeout?: number;
    outputLimit?: number;
}



/**
 * 执行自定义 Python 工具
 */
const executeCustomPythonTool = async (context: CustomToolExecutionContext): Promise<ToolExecuteResult> => {
    const { scriptPath, functionName, args, timeout = DEFAULT_TIMEOUT, outputLimit } = context;
    const limit = normalizeLimit(outputLimit);

    // 创建临时运行目录
    const tempDir = createTempRunDir();

    try {
        // 复制脚本文件到临时目录
        const scriptName = path.basename(scriptPath);
        const tempScriptPath = path.join(tempDir, scriptName);
        fs.copyFileSync(scriptPath, tempScriptPath);

        // 创建入口脚本
        const mainScript = `
# -*- coding: utf-8 -*-
import sys
import json
import importlib.util
import io
import traceback

# 设置 UTF-8 编码
if hasattr(sys.stdout, 'buffer') and sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

try:
    # 动态导入用户脚本
    spec = importlib.util.spec_from_file_location("user_module", "${scriptName}")
    if spec is None or spec.loader is None:
        raise ImportError("Failed to load module spec")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # 获取函数
    func_name = sys.argv[1]
    if not hasattr(module, func_name):
        raise AttributeError(f"Function '{func_name}' not found in module")

    func = getattr(module, func_name)

    # 解析参数
    args_json = sys.argv[2] if len(sys.argv) > 2 else "{}"
    args = json.loads(args_json)

    # 调用函数
    result = func(**args)

    # 输出结果
    output = {
        "success": True,
        "result": result
    }
    print(json.dumps(output, ensure_ascii=False))

except Exception as e:
    error_output = {
        "success": False,
        "error": str(e),
        "traceback": traceback.format_exc()
    }
    print(json.dumps(error_output, ensure_ascii=False))
    sys.exit(1)
        `.trim();

        const mainScriptPath = path.join(tempDir, '__main__.py');
        fs.writeFileSync(mainScriptPath, mainScript, 'utf-8');

        // 准备参数
        const argsJson = JSON.stringify(args);
        const env = getEnvVars();

        // 执行脚本
        return new Promise((resolve) => {
            childProcess.execFile(
                'python',
                [mainScriptPath, functionName, argsJson],
                {
                    cwd: tempDir,
                    timeout: timeout,
                    maxBuffer: 10 * 1024 * 1024, // 10MB
                    env
                },
                (error, stdout, stderr) => {
                    // 清理临时目录
                    cleanupTempDir(tempDir);

                    if (error) {
                        const errorMsg = error.message;
                        const stderrContent = stderr.trim();

                        // 检查是否是超时错误
                        if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('timeout')) {
                            resolve({
                                status: ToolExecuteStatus.ERROR,
                                error: `执行超时（${timeout}ms）\n${stderrContent}`
                            });
                            return;
                        }

                        resolve({
                            status: ToolExecuteStatus.ERROR,
                            error: `执行失败: ${errorMsg}\n${stderrContent}`
                        });
                        return;
                    }

                    // 解析输出
                    try {
                        const output = stdout.trim();
                        const result = JSON.parse(output);

                        if (!result.success) {
                            resolve({
                                status: ToolExecuteStatus.ERROR,
                                error: `Python 执行错误:\n${result.error}\n\n${result.traceback || ''}`
                            });
                            return;
                        }

                        // 处理结果
                        let resultData = result.result;

                        // 如果结果是字符串，应用输出限制并保存
                        if (typeof resultData === 'string') {
                            const saveResult = saveAndTruncate(`custom_${functionName}`, resultData, limit, {
                                name: functionName,
                                args: args
                            });
                            const formattedOutput = formatToolResult(saveResult, `Custom Tool: ${functionName}`);
                            resultData = formattedOutput;
                        }

                        resolve({
                            status: ToolExecuteStatus.SUCCESS,
                            data: resultData
                        });

                    } catch (parseError) {
                        // JSON 解析失败，返回原始输出
                        const rawOutput = stdout.trim();
                        const saveResult = saveAndTruncate(`custom_${functionName}`, rawOutput, limit, {
                            name: functionName,
                            args: args
                        });
                        const formattedOutput = formatToolResult(saveResult, `Custom Tool: ${functionName}`);
                        resolve({
                            status: ToolExecuteStatus.SUCCESS,
                            data: formattedOutput
                        });
                    }
                }
            );
        });

    } catch (error) {
        // 清理临时目录
        cleanupTempDir(tempDir);

        return {
            status: ToolExecuteStatus.ERROR,
            error: `准备执行环境失败: ${error.message}`
        };
    }
};

/**
 * 从工具定义中提取权限配置
 */
const extractPermissionConfig = (toolDef: IToolDefinition): {
    permissionLevel?: ToolPermissionLevel;
    requireExecutionApproval?: boolean;
    requireResultApproval?: boolean;
} => {
    const config: any = {};

    // 从 toolDef 中提取权限配置（如果存在）
    if ((toolDef as any).permissionLevel) {
        const level = (toolDef as any).permissionLevel;
        if (level === 'public') config.permissionLevel = ToolPermissionLevel.PUBLIC;
        else if (level === 'moderate') config.permissionLevel = ToolPermissionLevel.MODERATE;
        else if (level === 'sensitive') config.permissionLevel = ToolPermissionLevel.SENSITIVE;
    } else {
        // 默认为 SENSITIVE
        config.permissionLevel = ToolPermissionLevel.SENSITIVE;
    }

    if ((toolDef as any).requireExecutionApproval !== undefined) {
        config.requireExecutionApproval = (toolDef as any).requireExecutionApproval;
    } else {
        config.requireExecutionApproval = true;
    }

    if ((toolDef as any).requireResultApproval !== undefined) {
        config.requireResultApproval = (toolDef as any).requireResultApproval;
    } else {
        config.requireResultApproval = true;
    }

    return config;
};

/**
 * 为单个模块创建工具列表
 */
const createToolsFromModule = (module: ParsedToolModule): Tool[] => {
    const tools: Tool[] = [];

    for (const toolDef of module.moduleData.tools) {
        const permissionConfig = extractPermissionConfig(toolDef);

        const tool: Tool = {
            definition: {
                ...toolDef,
                ...permissionConfig
            },
            execute: async (args: Record<string, any>) => {
                return executeCustomPythonTool({
                    scriptPath: module.scriptPath,
                    functionName: toolDef.function.name,
                    args
                });
            },
            // 可选：添加参数压缩函数
            compressArgs: (args: Record<string, any>) => {
                return JSON.stringify(args).slice(0, 100);
            }
        };

        tools.push(tool);
    }

    return tools;
};



/**
 * 缓存的工具定义模块
 */
let cachedModules: ParsedToolModule[] = [];

/**
 * 获取缓存的工具模块
 */
export const getCachedModules = (): ParsedToolModule[] => {
    return cachedModules;
};

/**
 * 设置缓存的工具模块
 */
// const setCachedModules = (modules: ParsedToolModule[]): void => {
//     cachedModules = modules;
// };

/**
 * 从单个模块创建工具组
 */
const createToolGroupFromModule = (module: ParsedToolModule): ToolGroup => {
    const tools = createToolsFromModule(module);

    return {
        name: module.moduleData.name,
        tools: tools,
        rulePrompt: module.moduleData.rulePrompt || `Python 脚本工具模块: ${module.moduleData.name}`
    };
};

/**
 * 从缓存创建自定义脚本工具组数组
 * 每个 Python 脚本对应一个独立的工具组
 */
export const createCustomScriptToolGroupsFromCache = (): ToolGroup[] => {
    try {
        if (cachedModules.length === 0) {
            console.log('No cached custom script tools');
            return [];
        }

        // 为每个模块创建独立的工具组
        const toolGroups: ToolGroup[] = [];
        for (const module of cachedModules) {
            const group = createToolGroupFromModule(module);
            toolGroups.push(group);
        }

        console.log(`Created ${toolGroups.length} custom script tool groups from cached modules`);
        return toolGroups;

    } catch (error) {
        console.error('Failed to create custom script tool groups from cache:', error);
        return [];
    }
};

/**
 * 加载并缓存自定义脚本工具定义（使用智能加载）
 */
export const loadAndCacheCustomScriptTools = async (): Promise<{
    success: boolean;
    moduleCount: number;
    toolCount: number;
    reparsedCount: number;
    error?: string;
}> => {
    try {
        // 使用智能加载：检查时间戳，只在必要时重新解析
        const { modules, reparsedCount } = await scanCustomScriptsWithSmartLoad();

        // 缓存模块
        cachedModules = modules;

        // 计算工具总数
        const toolCount = modules.reduce((sum, m) => sum + m.moduleData.tools.length, 0);

        console.log(`Cached ${toolCount} custom script tools from ${modules.length} modules (reparsed ${reparsedCount} scripts)`);

        return {
            success: true,
            moduleCount: modules.length,
            toolCount,
            reparsedCount
        };
    } catch (error) {
        console.error('Failed to load custom script tools:', error);
        return {
            success: false,
            moduleCount: 0,
            toolCount: 0,
            reparsedCount: 0,
            error: error.message
        };
    }
};

/**
 * 导出用于设置页面的工具组创建函数
 */
export { scanCustomScripts, scanCustomScriptsWithSmartLoad, parseAllScripts, reparseOutdatedScripts } from './resolve-tools';
export { openCustomScriptsDir, checkPythonAvailable } from './utils';
