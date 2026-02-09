import { Tool, ToolExecuteResult, ToolExecuteStatus } from "../types";
import { normalizeLimit } from '../utils';

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');
const path = window?.require?.('path');
const os = window?.require?.('os');
const childProcess = window?.require?.('child_process');

if (!fs || !path || !os || !childProcess) {
    console.warn('[markitdown] Node.js modules not found. Markitdown tool is disabled.');
}

/**
 * 检查 markitdown 命令是否可用
 */
const checkMarkitdownAvailable = (): boolean => {
    if (!childProcess) return false;

    try {
        const platform = os.platform();
        const command = platform === 'win32' ? 'where markitdown' : 'which markitdown';
        childProcess.execSync(command, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
};

/**
 * Markitdown 工具：读取 Word、PDF 等文件内容
 * 使用 markitdown 命令行工具将文件转换为 Markdown 格式
 */
const MARKITDOWN_LIMIT = 7000;

export const markitdownTool: Tool = {
    SKIP_EXTERNAL_TRUNCATE: true, // 内部已处理截断
    DEFAULT_OUTPUT_LIMIT_CHAR: MARKITDOWN_LIMIT,

    definition: {
        type: 'function',
        function: {
            name: 'MarkitdownRead',
            description: '使用 markitdown 命令行工具读取 Word (.docx), PDF (.pdf) 等文件内容，转换为 Markdown 格式',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: '文件路径（支持 .docx, .pdf 等格式）'
                    },
                    begin: {
                        type: 'number',
                        description: '读取内容的起始位置，按字符计数，默认从头开始 (0)',
                        minimum: 0
                    },
                    limit: {
                        type: 'number',
                        description: `为了防止文件内容过大，限制最大字符数量；默认 ${MARKITDOWN_LIMIT}, 如果设置为 < 0 则不限制`,
                        minimum: -1
                    }
                },
                required: ['path']
            }
        }
    },

    permission: {
        executionPolicy: 'ask-always',
        resultApprovalPolicy: 'always'
    },

    execute: async (args: { path: string; limit?: number; begin?: number }): Promise<ToolExecuteResult> => {
        if (!fs || !path || !os || !childProcess) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '当前环境不支持文件系统操作'
            };
        }

        // 检查 markitdown 是否可用
        if (!checkMarkitdownAvailable()) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: '未找到 markitdown 命令行工具。请先安装: pip install markitdown'
            };
        }

        let begin = args.begin ?? 0;
        begin = Math.max(0, begin);
        const filePath = path.resolve(args.path);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `文件不存在: ${filePath}`
            };
        }

        // 检查文件类型
        const ext = path.extname(filePath).toLowerCase();
        const supportedExts = ['.docx', '.pdf', '.pptx', '.xlsx', '.html', '.htm'];
        if (!supportedExts.includes(ext)) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `不支持的文件类型: ${ext}。支持的类型: ${supportedExts.join(', ')}`
            };
        }

        try {
            // 创建临时目录
            const tmpDir = path.join(os.tmpdir(), 'markitdown-' + Date.now());
            fs.mkdirSync(tmpDir, { recursive: true });

            const outputFile = path.join(tmpDir, 'output.md');

            // 执行 markitdown 命令
            // markitdown <input_file> -o <output_file>
            const command = `markitdown "${filePath}" -o "${outputFile}"`;

            try {
                childProcess.execSync(command, {
                    encoding: 'utf8',
                    timeout: 30000, // 30秒超时
                    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
                });
            } catch (execError: any) {
                // 清理临时目录
                if (fs.existsSync(tmpDir)) {
                    fs.rmSync(tmpDir, { recursive: true, force: true });
                }

                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `markitdown 执行失败: ${execError.message}`
                };
            }

            // 检查输出文件是否存在
            if (!fs.existsSync(outputFile)) {
                // 清理临时目录
                fs.rmSync(tmpDir, { recursive: true, force: true });

                return {
                    status: ToolExecuteStatus.ERROR,
                    error: 'markitdown 未生成输出文件'
                };
            }

            // 读取转换后的内容
            let content: string = fs.readFileSync(outputFile, 'utf-8');
            const totalChars = content.length;

            // 应用字符范围限制
            const limit = normalizeLimit(args.limit, MARKITDOWN_LIMIT);

            // 先应用 begin 范围截取
            let rangeContent = content;
            const actualEnd = Number.isFinite(limit) ? Math.min(begin + limit, totalChars) : totalChars;
            if (begin > 0 || actualEnd < totalChars) {
                rangeContent = content.substring(begin, actualEnd);
            }

            // 构建内容（包含自定义元信息）
            const fileName = path.basename(filePath);
            let contentWithMeta = `--- Markitdown 转换结果 ---\n`;
            contentWithMeta += `文件: ${fileName}\n`;
            contentWithMeta += `临时输出: ${outputFile}\n`;
            contentWithMeta += `总字符数: ${totalChars}\n`;

            if (begin > 0 || actualEnd < totalChars) {
                contentWithMeta += `读取范围: ${begin} - ${actualEnd} 字符\n`;
            }

            contentWithMeta += `\n--- 文件内容 ---\n${rangeContent}`;

            // 返回原始 contentWithMeta
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: contentWithMeta
            };
        } catch (error: any) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `MarkitDown 处理失败: ${error.message}`
            };
        }
    }
};
