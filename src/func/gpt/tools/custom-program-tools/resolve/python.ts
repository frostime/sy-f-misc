import { thisPlugin } from '@frostime/siyuan-plugin-kits';
import {
    getScriptPath,
    listPythonScripts,
    createTempRunDir,
    cleanupTempDir
} from '../utils';
import { checkSyncIgnore, loadToolDefinition, needsReparse } from './common';
import type { ParsedToolModule } from '../types';
import { getEnvVars } from '../execute/common';

const fs = window?.require?.('fs');
const path = window?.require?.('path');
const childProcess = window?.require?.('child_process');

const getPy2ToolPath = (): string => {
    const plugin = thisPlugin();
    const pluginDir = window.siyuan.config.system.dataDir + `/plugins/${plugin.name}`;
    return path.join(pluginDir, 'scripts/py2tool.py');
};

export const parseAllPythonScripts = async (scriptPaths: string[]): Promise<{
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
        const pythonScripts = await listPythonScripts();
        for (const scriptName of pythonScripts) {
            const srcPath = getScriptPath(scriptName);
            const destPath = path.join(tempDir, scriptName);
            fs.copyFileSync(srcPath, destPath);
        }

        return new Promise((resolve) => {
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
                    const files = fs.readdirSync(tempDir);
                    const toolJsonFiles = files.filter(f => f.endsWith('.tool.json'));

                    for (const jsonFile of toolJsonFiles) {
                        const srcPath = path.join(tempDir, jsonFile);
                        const destPath = getScriptPath(jsonFile);
                        fs.copyFileSync(srcPath, destPath);
                    }

                    console.log('py2tool.py batch output:', stdout);
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

export const scanPythonScriptsWithSmartLoad = async (): Promise<{
    modules: ParsedToolModule[];
    reparsedCount: number;
}> => {
    await checkSyncIgnore();

    const pythonScripts = await listPythonScripts();
    const scriptsToParse: string[] = [];

    for (const scriptName of pythonScripts) {
        const scriptPath = getScriptPath(scriptName);
        const toolJsonPath = scriptPath.replace('.py', '.tool.json');

        if (needsReparse(scriptPath, toolJsonPath)) {
            scriptsToParse.push(scriptPath);
        }
    }

    if (scriptsToParse.length > 0) {
        console.log(`解析 ${scriptsToParse.length} 个 Python 脚本`);
        await parseAllPythonScripts(scriptsToParse);
    }

    return {
        modules: [],  // 由统一扫描函数负责加载
        reparsedCount: scriptsToParse.length
    };
};