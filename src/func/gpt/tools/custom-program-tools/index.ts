import { Tool, ToolGroup, ToolPermission } from "../types";
import { ParsedToolModule } from './types';
import { extractPermissionConfig, extractDeclaredReturnType } from './execute/common';
import { executeCustomPythonTool } from './execute/python';
import { executeCustomPowerShellTool } from './execute/powershell';
import { scanPythonScriptsWithSmartLoad } from './resolve/python';
import { scanPowerShellScriptsWithSmartLoad } from './resolve/powershell';
import { checkSyncIgnore, loadToolDefinition } from './resolve/common';
import { listToolJsonFiles, getScriptPath, fileExists, getFileModifiedTime } from './utils';

let cachedModules: ParsedToolModule[] = [];

export const getCachedModules = (): ParsedToolModule[] => {
    return cachedModules;
};

const createToolsFromModule = (module: ParsedToolModule): Tool[] => {
    const tools: Tool[] = [];
    const isPython = module.scriptType === 'python';

    for (const toolDef of module.moduleData.tools) {
        const defaultPerms = module.moduleData.defaultPermissions || {};
        const permissionConfig: ToolPermission = {
            ...extractPermissionConfig(toolDef),
            ...defaultPerms
        };

        const declaredReturnType = extractDeclaredReturnType(toolDef);

        const tool: Tool = {
            definition: toolDef,
            permission: permissionConfig,
            declaredReturnType,
            execute: async (args: Record<string, any>) => {
                const executor = isPython ? executeCustomPythonTool : executeCustomPowerShellTool;
                return executor({
                    scriptPath: module.scriptPath,
                    functionName: toolDef.function.name,
                    args
                });
            },
            compressArgs: (args: Record<string, any>) => {
                return JSON.stringify(args).slice(0, 100);
            }
        };

        tools.push(tool);
    }

    return tools;
};

const createToolGroupFromModule = (module: ParsedToolModule): ToolGroup => {
    const tools = createToolsFromModule(module);

    return {
        name: module.moduleData.name,
        tools: tools,
        rulePrompt: module.moduleData.rulePrompt || `脚本工具模块: ${module.moduleData.name}`
    };
};

export const createCustomScriptToolGroupsFromCache = (): ToolGroup[] => {
    try {
        if (cachedModules.length === 0) {
            console.log('No cached custom script tools');
            return [];
        }

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

export const loadAndCacheCustomScriptTools = async (): Promise<{
    success: boolean;
    moduleCount: number;
    toolCount: number;
    reparsedCount: number;
    error?: string;
}> => {
    try {
        const { modules, reparsedCount } = await scanAllCustomScriptsWithSmartLoad();
        cachedModules = modules;

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

// 统一扫描所有脚本
export const scanAllCustomScriptsWithSmartLoad = async (): Promise<{
    modules: ParsedToolModule[];
    reparsedCount: number;
}> => {
    await checkSyncIgnore();

    // 分别扫描 Python 和 PowerShell
    const [pyResult, psResult] = await Promise.all([
        scanPythonScriptsWithSmartLoad(),
        scanPowerShellScriptsWithSmartLoad()
    ]);

    // 加载所有工具定义
    const modules: ParsedToolModule[] = [];
    const toolJsonFiles = await listToolJsonFiles();

    for (const jsonFile of toolJsonFiles) {
        const toolJsonPath = getScriptPath(jsonFile);
        const moduleData = await loadToolDefinition(toolJsonPath);

        if (!moduleData) continue;

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
        reparsedCount: pyResult.reparsedCount + psResult.reparsedCount
    };
};

// 导出给设置页面使用
export { parseAllPythonScripts } from './resolve/python';
export { parseAllPowerShellScripts } from './resolve/powershell';
export { openCustomScriptsDir, checkPythonAvailable, checkPowerShellAvailable } from './utils';