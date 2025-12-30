/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-30 16:56:33
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/execute/powershell.ts
 */
import { ToolExecuteResult, ToolExecuteStatus } from '../../types';
import { CustomToolExecutionContext } from '../types';
import { createTempRunDir, cleanupTempDir } from '../utils';
import { getEnvVars } from './common';
import { execFile, getShellInfo } from '@/libs/system-utils';

const fs = window?.require?.('fs');
const path = window?.require?.('path');

const DEFAULT_TIMEOUT = 30000;

export const executeCustomPowerShellTool = async (
    context: CustomToolExecutionContext
): Promise<ToolExecuteResult> => {
    const { scriptPath, functionName, args, timeout = DEFAULT_TIMEOUT } = context;
    const tempDir = createTempRunDir();

    try {
        // 1. 读取原始脚本内容
        const originalScript = fs.readFileSync(scriptPath, 'utf-8');
        const argsJson = JSON.stringify(args);

        // 2. 构建执行代码（追加到原始脚本末尾）
        const executionCode = `

# ========== Execution Code (Auto-generated) ==========
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($PSStyle) {
    $PSStyle.OutputRendering = [System.Management.Automation.OutputRendering]::PlainText
}
$ErrorActionPreference = 'Stop'

try {
    # 使用 here-string 避免转义问题
    $argsJson = @'
${argsJson}
'@
    $argsHash = $argsJson | ConvertFrom-Json -AsHashtable

    # 调用用户定义的函数
    $result = ${functionName} @argsHash

    # 构建成功输出
    $output = @{
        success = $true
        result = $result
    }

    # 输出 JSON（使用 -Compress 确保单行输出）
    $output | ConvertTo-Json -Depth 10 -Compress

} catch {
    # 构建错误输出
    $errorOutput = @{
        success = $false
        error = $_.Exception.Message
        traceback = $_.ScriptStackTrace
    }
    $errorOutput | ConvertTo-Json -Depth 10 -Compress
}
        `.trim();

        // 3. 合并脚本：原始内容 + 执行代码
        const fullScript = originalScript + '\n\n' + executionCode;

        // 4. 写入临时文件
        const tempScriptPath = path.join(tempDir, '__exec__.ps1');
        fs.writeFileSync(tempScriptPath, fullScript, 'utf-8');

        // 5. 获取 PowerShell 可执行文件路径
        const shellInfo = await getShellInfo();
        const powershellExe = shellInfo.shell;

        // 6. 执行脚本
        const result = await execFile(powershellExe, [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            tempScriptPath
        ], {
            cwd: tempDir,
            timeout,
            env: getEnvVars()
        });

        // 7. 清理临时目录
        cleanupTempDir(tempDir);

        // 8. 处理执行结果
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
                error: `PowerShell 执行失败: ${errorMsg}\n${stderrContent}`
            };
        }

        // 9. 解析 JSON 输出
        try {
            const output = result.stdout.trim();
            const parsed = JSON.parse(output);

            if (!parsed.success) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `PowerShell 执行错误:\n${parsed.error}\n\n${parsed.traceback || ''}`
                };
            }

            const executeResult: ToolExecuteResult = {
                status: ToolExecuteStatus.SUCCESS,
                data: parsed.result
            };

            // 支持格式化文本（如果有）
            if (parsed.formattedText) {
                executeResult.formattedText = parsed.formattedText;
            }

            return executeResult;

        } catch (parseError) {
            // JSON 解析失败，返回原始输出
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
