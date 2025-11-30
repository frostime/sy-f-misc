import { complete } from "../openai";
import { Tool, ToolExecuteResult } from "./types";
import * as store from '@gpt/setting/store';

const fs = window?.require?.('fs');
const path = window?.require?.('path');
const os = window?.require?.('os');

const MAX_LOG_NUMBER = 100;

export const formatWithXMLTags = (options: {
    tagName: string; content: string; attrs?: Record<string, string>;
}): string => {
    const { tagName, content, attrs = {} } = options;
    // const indentStr = ' '.repeat(indent);
    const attrsStr = Object.entries(attrs)
        .map(([key, value]) => ` ${key}="${value.replace(/"/g, '&quot;')}"`)
        .join('');
    let body = `<${tagName}${attrsStr}>`;
    if (content.includes('\n')) {
        body += `\n${content}\n`;
    } else {
        body += content;
    }
    body += `</${tagName}>`;
    return body;
}

export const formatArraysToToon = (items: object[], prefix: string = '') => {
    if (items.length === 0) return `${prefix}[0]{}`;

    const keys = Object.keys(items[0]);
    const lines = [`${prefix}[${items.length}]{${keys.join(',')}}`];

    for (const item of items) {
        const values = keys.map(key => {
            const value = item[key];

            if (value === null || value === undefined) return '';
            if (typeof value === 'object') {
                // Base64 编码避免所有转义问题
                return JSON.stringify(value).replace(/"/g, '\\"');
            }

            const str = String(value);
            // RFC 4180: 包含特殊字符时用引号包裹
            if (/[",\n\r]/.test(str)) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        });
        lines.push(values.join(','));
    }

    return lines.join('\n');
};


/**
 * 获取临时目录根路径
 * 使用 realpathSync.native 避免 Windows 8.3 短文件名格式
 */
export const tempRoot = (): string => {
    const tmpdir = os.tmpdir();
    const targetPath = path.join(tmpdir, 'siyuan_temp');

    // 确保目录存在
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }

    // 对已存在的目录进行路径规范化
    try {
        return fs.realpathSync.native?.(targetPath) ?? fs.realpathSync(targetPath);
    } catch {
        return targetPath;
    }
};

/**
 * 安全地创建目录（如果不存在）
 */
export const safeCreateDir = (dir: string): void => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

/**
 * 工具调用信息
 */
export interface ToolCallInfo {
    /** 工具名称 */
    name: string;
    /** 工具参数 */
    args: Record<string, any>;
}

/**
 * 在临时目录下创建文本文件用来缓存工具调用结果
 * @param toolKey 工具名称/标识符
 * @param ext 文件扩展名，默认 'log'
 * @param content 文本内容
 * @param toolCallInfo 可选的工具调用信息，会被记录在文件开头
 * @returns 文件完整路径
 */
const createTempfile = (
    toolKey: string,
    ext: string = 'log',
    content?: string,
): string => {
    const tempDir = tempRoot();
    safeCreateDir(tempDir);
    const suffix = Math.random().toString(16).slice(2, 10);
    const filePath = path.join(tempDir, `${toolKey}_${Date.now()}_${suffix}.${ext}`);

    if (typeof content !== 'string') {
        content = JSON.stringify(content);
    }

    if (content !== undefined) {
        fs.writeFileSync(filePath, content, 'utf-8');
    }
    return filePath;
};


/**
 * 防止临时目录下文件过多，删除较旧的文件
 * @returns 
 */
export const pruneOldTempToollogFiles = (): void => {
    if (!fs || !path || !os) {
        return;
    }
    const tempDir = tempRoot();
    if (!fs.existsSync(tempDir)) {
        return;
    }
    const files = fs.readdirSync(tempDir)
        .map(file => ({
            name: file,
            time: fs.statSync(path.join(tempDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
    if (files.length > MAX_LOG_NUMBER) {
        const filesToDelete = files.slice(MAX_LOG_NUMBER);
        for (const file of filesToDelete) {
            fs.unlinkSync(path.join(tempDir, file.name));
        }
    }
}


/**
 * 仅保存工具调用结果到本地文件（用于日志记录）
 * @param toolName 工具名称
 * @param args 工具参数
 * @param rawData 原始数据
 * @returns 缓存文件路径
 */
export const cacheToolCallResult = (
    toolName: string,
    args: Record<string, any>,
    result: ToolExecuteResult
): string | null => {
    if (fs === undefined) {
        return null;
    }

    let content: string;
    if (typeof result.formattedText === 'string') {
        content = result.formattedText;
    } else {
        try {
            content = JSON.stringify(result.data, null, 2);
        } catch (error) {
            content = String(result.data);
        }
    }

    const argsString = Object.entries(args)
        .map(([key, value]) => `${key}:${JSON.stringify(value).length > 100 ? '\n' : ' '}${value}`)
        .join('\n');
    const logText = [
        `------ Tool Call: ${toolName} ------`,
        argsString,
        `------ Tool Call Result | Full Formatted ------`,
        content,
    ];
    if (result.data !== content) {
        logText.push(`------ Tool Call Result | Raw ------`);
        logText.push(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2));
    }

    const tempFilePath = createTempfile(
        toolName,
        'log',
        logText.join('\n'),
    );

    return tempFilePath;
};



export const DEFAULT_LIMIT_CHAR = 8000;

/**
 * 标准化输出长度限制
 * @param limit 用户提供的限制值
 * @param defaultLimit 默认限制值
 * @returns 标准化后的限制值
 */
export const normalizeLimit = (limit?: number, defaultLimit: number = DEFAULT_LIMIT_CHAR): number => {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
        return defaultLimit;
    }
    return limit <= 0 ? Number.POSITIVE_INFINITY : limit;
};

/**
 * 截断结果
 */
export interface TruncateResult {
    /** 截断后的内容 */
    content: string;
    /** 是否被截断 */
    isTruncated: boolean;
    /** 原始内容长度 */
    originalLength: number;
    /** 显示的内容长度 */
    shownLength: number;
    /** 省略的内容长度 */
    omittedLength: number;
}

/**
 * 截断内容（头尾模式）
 * @param content 原始内容
 * @param maxLength 最大长度限制
 * @returns 截断结果
 */
export const truncateContent = (content: string, maxLength: number): TruncateResult => {
    if (!Number.isFinite(maxLength) || maxLength <= 0 || content.length <= maxLength) {
        return {
            content,
            isTruncated: false,
            originalLength: content.length,
            shownLength: content.length,
            omittedLength: 0
        };
    }

    const headLength = Math.floor(maxLength / 2);
    const tailLength = maxLength - headLength;
    const head = content.slice(0, headLength);
    const tail = content.slice(-tailLength);
    const omitted = content.length - maxLength;

    return {
        content: `${head}\n\n...输出过长，省略中间 ${omitted} 个字符...\n\n${tail}`,
        isTruncated: true,
        originalLength: content.length,
        shownLength: maxLength,
        omittedLength: omitted
    };
};


/**
 * 格式化内容并添加行号
 * @param content 文本内容
 * @param startLine 起始行号（从1开始）
 * @param highlightLine 可选的高亮行号
 * @returns 带行号的文本内容
 */
export const formatWithLineNumber = (
    content: string,
    startLine: number = 1,
    highlightLine?: number
): string => {
    const lines = content.split('\n');
    const maxLineNum = startLine + lines.length - 1;
    const padding = maxLineNum.toString().length;

    return lines.map((line, index) => {
        const lineNum = startLine + index;
        const isHighlight = highlightLine === lineNum;
        const prefix = isHighlight ? '→' : ' ';
        return `${prefix}${lineNum.toString().padStart(padding)}: ${line}`;
    }).join('\n');
};

/**
 * 文件大小格式化
 * @param size 文件大小（字节）
 * @returns 格式化后的文件大小字符串
 */
export const formatFileSize = (size: number): string => {
    if (size < 1024) {
        return size.toFixed(2) + ' B';
    } else if (size < 1024 * 1024) {
        return (size / 1024).toFixed(2) + ' KB';
    } else if (size < 1024 * 1024 * 1024) {
        return (size / (1024 * 1024)).toFixed(2) + ' MB';
    } else {
        return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
};

export const toolCallSafetyReview = async (toolDef: Tool['definition'], args: Record<string, any>): Promise<string> => {
    const systemPrompt = `你是一个 LLM Tool Call Safety 审核助手。你的任务是审核用户请求调用的工具和参数，判断是否存在潜在的安全风险或滥用可能性。注意是否会更改用户数据，或者访问敏感信息等。

输入:
- 工具调用的定义
- LLM 请求的参数

输出: Markdown 格式文本，格式严格遵循下面的要求:
- 安全风险: "无" | "低" | "中" | "高"
- 安全性评价: 详细说明工具调用的安全性，指出可能的风险点 (一两句话)
- 建议: 如果存在风险，提供具体的缓解建议；如果没有风险，说明可以安全使用 (一两句话)

内容凝练，如无必要不超过200字; 直接输出内容，不包含 \`\`\` 代码块等冗余标记
`
    const response = await complete(`Tool Definition:
${JSON.stringify(toolDef, null)}

User Arguments:
${JSON.stringify(args, null)}
`, {
        model: store.useModel(store.defaultConfig().utilityModelId || store.defaultModelId()),
        systemPrompt: systemPrompt,
        option: {
            temperature: 0,
            stream: false
        }
    });
    if (response.ok === false) {
        return `自动化安全审核失败，${response.content || '未知错误'}`;
    }

    let cleanContent = response.content.trim();
    return cleanContent;
}
