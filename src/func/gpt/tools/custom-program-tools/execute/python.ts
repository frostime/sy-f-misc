/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-30 16:56:33
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/execute/python.ts
 */
import { ToolExecuteResult, ToolExecuteStatus } from '../../types';
import { CustomToolExecutionContext } from '../types';
import { createTempRunDir, cleanupTempDir } from '../utils';
import { getEnvVars } from './common';
import { execFile } from '@/libs/system-utils';

const fs = window?.require?.('fs');
const path = window?.require?.('path');

const DEFAULT_TIMEOUT = 30000;

export const executeCustomPythonTool = async (
    context: CustomToolExecutionContext
): Promise<ToolExecuteResult> => {
    const { scriptPath, functionName, args, timeout = DEFAULT_TIMEOUT } = context;
    const tempDir = createTempRunDir();

    try {
        const scriptName = path.basename(scriptPath);
        const tempScriptPath = path.join(tempDir, scriptName);
        fs.copyFileSync(scriptPath, tempScriptPath);

        const mainScript = `
# -*- coding: utf-8 -*-
import sys
import json
import importlib.util
import io
import traceback

if hasattr(sys.stdout, 'buffer') and sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

try:
    spec = importlib.util.spec_from_file_location("user_module", "${scriptName}")
    if spec is None or spec.loader is None:
        raise ImportError("Failed to load module spec")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    func_name = sys.argv[1]
    if not hasattr(module, func_name):
        raise AttributeError(f"Function '{func_name}' not found in module")

    func = getattr(module, func_name)
    args_json = sys.argv[2] if len(sys.argv) > 2 else "{}"
    args = json.loads(args_json)
    result = func(**args)

    output = {
        "success": True,
        "result": result
    }

    if hasattr(func, 'format') and callable(func.format):
        try:
            formatted = func.format(result, args)
            if isinstance(formatted, str):
                output["formattedText"] = formatted
        except Exception as fmt_err:
            output["formatWarning"] = str(fmt_err)

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

        const argsJson = JSON.stringify(args);

        // 使用 system-utils 的 execFile
        const result = await execFile('python', [mainScriptPath, functionName, argsJson], {
            cwd: tempDir,
            timeout,
            env: getEnvVars()
        });

        cleanupTempDir(tempDir);

        if (!result.success) {
            const errorMsg = result.error || '';
            const stderrContent = result.stderr;

            if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('timeout')) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `执行超时（${timeout}ms）\n${stderrContent}`
                };
            }

            return {
                status: ToolExecuteStatus.ERROR,
                error: `执行失败: ${errorMsg}\n${stderrContent}`
            };
        }

        try {
            const output = result.stdout.trim();
            const parsed = JSON.parse(output);

            if (!parsed.success) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `Python 执行错误:\n${parsed.error}\n\n${parsed.traceback || ''}`
                };
            }

            const executeResult: ToolExecuteResult = {
                status: ToolExecuteStatus.SUCCESS,
                data: parsed.result
            };

            if (parsed.formattedText) {
                executeResult.formattedText = parsed.formattedText;
            }

            return executeResult;

        } catch {
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: result.stdout.trim()
            };
        }

    } catch (error) {
        cleanupTempDir(tempDir);
        return {
            status: ToolExecuteStatus.ERROR,
            error: `准备执行环境失败: ${error.message}`
        };
    }
};
