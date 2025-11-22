const fs = window?.require?.('fs');
const path = window?.require?.('path');
const os = window?.require?.('os');

/**
 * 获取临时目录根路径
 */
export const tempRoot = (): string => {
    return path.join(os.tmpdir(), 'siyuan_temp');
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
export const createTempfile = (
    toolKey: string,
    ext: string = 'log',
    content?: string,
    toolCallInfo?: ToolCallInfo
): string => {
    const tempDir = tempRoot();
    safeCreateDir(tempDir);
    const suffix = Math.random().toString(16).slice(2, 10);
    const filePath = path.join(tempDir, `${toolKey}_${Date.now()}_${suffix}.${ext}`);

    if (content !== undefined) {
        let finalContent = content;

        const args = toolCallInfo?.args || {};
        const argsString = Object.entries(args)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('\n');
        // 如果提供了工具调用信息，添加到文件开头
        if (toolCallInfo) {
            const header = [
                `------ Tool Call: ${toolCallInfo.name} ------`,
                argsString,
                `------ Tool Call Result ------`,
                ''
            ].join('\n');
            finalContent = header + content;
        }

        fs.writeFileSync(filePath, finalContent, 'utf-8');
    }
    return filePath;
};

/**
 * 在临时目录下创建目录用来缓存工具调用结果
 * @param name 目录名称
 * @param subfiles 可选参数，表示在创建目录的同时创建子文件，key 为子文件名，value 为子文件内容
 * @returns 创建的目录路径
 */
export const createTempdir = (name: string, subfiles?: Record<string, string>): string => {
    const tempDir = path.join(tempRoot(), name);
    safeCreateDir(tempDir);

    if (subfiles) {
        for (const [filename, content] of Object.entries(subfiles)) {
            const filePath = path.join(tempDir, filename);
            fs.writeFileSync(filePath, content, 'utf-8');
        }
    }

    return tempDir;
};

export const DEFAULT_LIMIT_CHAR = 7000;

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
        content: `${head}\n\n...输出过长，省略 ${omitted} 个字符...\n\n${tail}`,
        isTruncated: true,
        originalLength: content.length,
        shownLength: maxLength,
        omittedLength: omitted
    };
};

/**
 * 保存并截断结果
 */
export interface SaveAndTruncateResult extends TruncateResult {
    /** 临时文件路径 */
    tempFilePath: string;
    /** 工具名称（用于显示） */
    toolName?: string;
}

/**
 * 保存并截断内容
 * @param toolKey 工具名称/标识符
 * @param content 原始内容
 * @param maxLength 最大长度限制
 * @param toolCallInfo 可选的工具调用信息，会被记录在文件开头
 * @returns 保存和截断结果
 */
export const saveAndTruncate = (
    toolKey: string,
    content: string,
    maxLength: number,
    toolCallInfo?: ToolCallInfo
): SaveAndTruncateResult => {
    const tempFilePath = createTempfile(toolKey, 'log', content, toolCallInfo);
    const truncResult = truncateContent(content, maxLength);

    return {
        ...truncResult,
        tempFilePath,
        toolName: toolCallInfo?.name
    };
};

/**
 * 格式化工具执行结果消息（统一的展示格式）
 * @param result 保存和截断结果
 * @param toolName 工具名称（用于显示），如果不提供则使用 result.toolName
 * @returns 格式化后的消息字符串
 */
export const formatToolResult = (
    result: SaveAndTruncateResult,
    toolName?: string
): string => {
    const lines: string[] = [];

    // 优先使用传入的 toolName，否则使用 result.toolName
    const effectiveToolName = toolName || result.toolName;
    if (effectiveToolName) {
        lines.push(`工具: ${effectiveToolName}`);
    }

    lines.push(`完整输出已保存至: ${result.tempFilePath}`);
    lines.push(`原始长度: ${result.originalLength} 字符`);

    if (result.isTruncated) {
        lines.push(`显示长度: ${result.shownLength} 字符 (省略了 ${result.omittedLength} 字符)`);
    }

    lines.push('');
    lines.push(result.content);

    return lines.join('\n');
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
