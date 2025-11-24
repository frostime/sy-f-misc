const fs = window?.require?.('fs');
const path = window?.require?.('path');
const os = window?.require?.('os');

const MAX_LOG_NUMBER = 100;

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
const createTempfile = (
    toolKey: string,
    ext: string = 'log',
    content?: string,
    toolCallInfo?: ToolCallInfo
): string => {
    const tempDir = tempRoot();
    safeCreateDir(tempDir);
    const suffix = Math.random().toString(16).slice(2, 10);
    const filePath = path.join(tempDir, `${toolKey}_${Date.now()}_${suffix}.${ext}`);

    if (typeof content !== 'string') {
        content = JSON.stringify(content);
    }

    if (content !== undefined) {
        let finalContent = content;

        const args = toolCallInfo?.args || {};
        const argsString = Object.entries(args)
            .map(([key, value]) => `${key}:${JSON.stringify(value).length > 100 ? '\n' : ' '}${value}`)
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
const createTempdir = (name: string, subfiles?: Record<string, string>): string => {
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
 * 工具输出处理选项
 */
export interface ProcessToolOutputOptions {
    /** 工具标识符，用于日志文件命名 */
    toolKey: string;
    /** 工具输出内容 */
    content: string;
    /** 工具调用信息（会被记录在日志文件开头） */
    toolCallInfo?: ToolCallInfo;
    /** 
     * 为 LLM 输出做准备：截断 + 格式化
     * - false: 仅缓存到本地，不截断不格式化（默认）
     * - true: 使用默认长度限制截断并格式化
     * - number: 使用指定长度限制截断并格式化
     * 
     * 用于需要将结果返回给 LLM 的场景，会自动添加文件路径、长度等元信息
     */
    truncateForLLM?: boolean | number;
}

/**
 * 工具输出处理结果
 */
export interface ProcessToolOutputResult {
    /** 处理后的输出内容（如果 format=true 则包含格式化信息） */
    output: string;
    /** 临时文件路径 */
    tempFilePath: string;
    /** 是否被截断 */
    isTruncated: boolean;
    /** 原始内容长度 */
    originalLength: number;
    /** 显示的内容长度（如果未截断则等于原始长度） */
    shownLength: number;
    /** 省略的内容长度 */
    omittedLength: number;
}

/**
 * 处理工具输出：缓存 + 可选截断 + 可选格式化
 * 
 * 使用场景：
 * 1. 仅缓存（不返回给 LLM）：processToolOutput({ toolKey, content, toolCallInfo })
 * 2. 缓存 + 截断 + 格式化（返回给 LLM）：processToolOutput({ toolKey, content, toolCallInfo, truncateForLLM: true })
 * 3. 自定义截断长度：processToolOutput({ toolKey, content, toolCallInfo, truncateForLLM: 5000 })
 * 
 * @param options 处理选项
 * @returns 处理结果
 */
export const processToolOutput = (options: ProcessToolOutputOptions): ProcessToolOutputResult => {
    const {
        toolKey,
        content,
        toolCallInfo,
        truncateForLLM = false
    } = options;

    // 1. 缓存到本地文件
    const tempFilePath = createTempfile(toolKey, 'log', content, toolCallInfo);

    // 2. 确定是否需要为 LLM 处理（截断 + 格式化）
    const shouldProcessForLLM = truncateForLLM !== false;

    // 3. 确定截断长度
    let maxLength: number;
    if (!shouldProcessForLLM) {
        maxLength = Number.POSITIVE_INFINITY; // 不截断
    } else if (truncateForLLM === true) {
        maxLength = DEFAULT_LIMIT_CHAR; // 使用默认限制
    } else {
        maxLength = truncateForLLM; // 使用指定限制
    }

    // 4. 执行截断
    const truncResult = truncateContent(content, maxLength);

    // 5. 决定输出内容
    let output: string;
    if (shouldProcessForLLM) {
        // 格式化输出，包含元信息（用于 LLM）
        const lines: string[] = [];

        if (toolCallInfo?.name) {
            lines.push(`工具: ${toolCallInfo.name}`);
        }

        lines.push(`完整输出已保存至: ${tempFilePath}`);
        lines.push(`原始长度: ${truncResult.originalLength} 字符`);

        if (truncResult.isTruncated) {
            lines.push(`显示长度: ${truncResult.shownLength} 字符 (省略了 ${truncResult.omittedLength} 字符)`);
        }

        lines.push('');
        lines.push(truncResult.content);

        output = lines.join('\n');
    } else {
        // 原始输出（仅缓存场景）
        output = truncResult.content;
    }

    return {
        output,
        tempFilePath,
        isTruncated: truncResult.isTruncated,
        originalLength: truncResult.originalLength,
        shownLength: truncResult.shownLength,
        omittedLength: truncResult.omittedLength
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
