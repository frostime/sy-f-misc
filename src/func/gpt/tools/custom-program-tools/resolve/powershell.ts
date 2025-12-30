import { thisPlugin } from '@frostime/siyuan-plugin-kits';
import {
    getScriptPath,
    listPowerShellScripts,
    createTempRunDir,
    cleanupTempDir
} from '../utils';
import { needsReparse } from './common';
import type { ParsedToolModule } from '../types';
import { execFile, getShellInfo } from '@/libs/system-utils';

const fs = window?.require?.('fs');
const path = window?.require?.('path');

const getPs2ToolPath = (): string => {
    const plugin = thisPlugin();
    const pluginDir = window.siyuan.config.system.dataDir + `/plugins/${plugin.name}`;
    return path.join(pluginDir, 'scripts/ps2tool.ps1');
};

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
        const psScripts = await listPowerShellScripts();
        for (const scriptName of psScripts) {
            const srcPath = getScriptPath(scriptName);
            const destPath = path.join(tempDir, scriptName);
            fs.copyFileSync(srcPath, destPath);
        }

        // 获取 shell 信息以确定使用哪个 PowerShell 版本
        const shellInfo = await getShellInfo();
        const powershellExe = shellInfo.shell;

        // 构建参数
        const args = [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            ps2toolPath,
            '-Dir',
            tempDir,
            '-WithMtime'
        ];

        // 使用 system-utils 的 execFile 执行命令
        const result = await execFile(powershellExe, args, {
            timeout: 60000,
            cwd: tempDir
        });

        if (!result.success) {
            cleanupTempDir(tempDir);
            return {
                success: false,
                successCount: 0,
                errors: [{ script: 'all', error: `${result.error || '执行失败'}\n${result.stderr}` }]
            };
        }

        try {
            const files = fs.readdirSync(tempDir);
            const toolJsonFiles = files.filter(f => f.endsWith('.tool.json'));

            for (const jsonFile of toolJsonFiles) {
                const srcPath = path.join(tempDir, jsonFile);
                const destPath = getScriptPath(jsonFile);
                fs.copyFileSync(srcPath, destPath);
            }

            console.log('ps2tool.ps1 output:', result.stdout);
            return {
                success: true,
                successCount: scriptPaths.length,
                errors: []
            };
        } catch (copyError) {
            return {
                success: false,
                successCount: 0,
                errors: [{ script: 'all', error: `复制结果失败: ${copyError.message}` }]
            };
        } finally {
            cleanupTempDir(tempDir);
        }
    } catch (error) {
        cleanupTempDir(tempDir);
        return {
            success: false,
            successCount: 0,
            errors: [{ script: 'all', error: error.message }]
        };
    }
};

export const scanPowerShellScriptsWithSmartLoad = async (): Promise<{
    modules: ParsedToolModule[];
    reparsedCount: number;
}> => {
    const powerShellScripts = await listPowerShellScripts();
    const scriptsToParse: string[] = [];

    for (const scriptName of powerShellScripts) {
        const scriptPath = getScriptPath(scriptName);
        const toolJsonPath = scriptPath.replace('.ps1', '.tool.json');

        if (needsReparse(scriptPath, toolJsonPath)) {
            scriptsToParse.push(scriptPath);
        }
    }

    if (scriptsToParse.length > 0) {
        console.log(`解析 ${scriptsToParse.length} 个 PowerShell 脚本`);
        await parseAllPowerShellScripts(scriptsToParse);
    }

    return {
        modules: [],
        reparsedCount: scriptsToParse.length
    };
};