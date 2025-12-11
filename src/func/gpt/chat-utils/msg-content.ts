/*
 * 用来处理 TMessageContent 也就就是 IMessage['content'] 的模块
 */


import {
    isTextContent,
    isImageContent,
    isAudioContent,
    isFileContent
} from './msg-modal';

// ============================================================================
// Content Extraction
// ============================================================================

export interface ExtractedContent {
    text: string;
    textParts: string[],
    images: string[];
    audios: Array<{ data: string; format: 'wav' | 'mp3' }>;
    files: Array<{ data?: string; id?: string; filename?: string }>;
}

/**
 * 从消息内容中提取各类媒体
 */
export function extractMessageContent(content: Readonly<TMessageContent>): ExtractedContent {
    if (typeof content === 'string') {
        return {
            text: content,
            textParts: [content],
            images: [],
            audios: [],
            files: []
        };
    }

    const textParts = content.filter(isTextContent).map(p => p.text);
    const images = content.filter(isImageContent).map(p => p.image_url.url);
    const audios = content.filter(isAudioContent).map(p => ({
        data: p.input_audio.data,
        format: p.input_audio.format
    }));
    const files = content.filter(isFileContent).map(p => ({
        data: p.file.file_data,
        id: p.file.file_id,
        filename: p.file.filename
    }));

    return {
        text: textParts.join('\n'),
        textParts,
        images,
        audios,
        files
    };
}


/**
 * 从消息中提取纯文本
 */
export function extractContentText(content: Readonly<TMessageContent>): string {
    if (typeof content === 'string') return content;

    return content
        .filter(isTextContent)
        .map(part => part.text)
        .join('\n');
}

/**
 * 从消息中提取图片 URLs
 */
export function extractContentImages(content: Readonly<TMessageContent>): string[] {
    if (typeof content === 'string') return [];

    return content
        .filter(isImageContent)
        .map(part => part.image_url.url);
}

/**
 * 从消息中提取音频
 */
export function extractContentAudios(content: Readonly<TMessageContent>): Array<{ data: string; format: 'wav' | 'mp3' }> {
    if (typeof content === 'string') return [];

    return content
        .filter(isAudioContent)
        .map(part => ({
            data: part.input_audio.data,
            format: part.input_audio.format
        }));
}

/**
 * 从消息中提取文件
 */
export function extractContentFiles(content: Readonly<TMessageContent>): Array<{ data?: string; id?: string; filename?: string }> {
    if (typeof content === 'string') return [];

    return content
        .filter(isFileContent)
        .map(part => ({
            data: part.file.file_data,
            id: part.file.file_id,
            filename: part.file.filename
        }));
}

// ============================================================================
// Content Manipulation
// ============================================================================

/**
 * 更新消息中的文本内容
 * @param content 消息内容
 * @param newText 新的文本内容
 * @param partIndex 要更新的文本部分的索引，默认为 0（第一个）
 */
export function updateContentText(
    content: Readonly<TMessageContent>,
    newText: string,
    partIndex: number = 0
): TMessageContent {
    if (typeof content === 'string') {
        return newText;
    }

    const textPartIndices = content.reduce<number[]>((acc, part, index) => {
        return isTextContent(part) ? [...acc, index] : acc;
    }, []);

    // 如果没有文本部分，使用展开运算符避免修改原本的 content
    if (textPartIndices.length === 0) {
        return [{ type: 'text', text: newText }, ...content];
    }

    const targetIndex = partIndex < 0 || partIndex >= textPartIndices.length
        ? textPartIndices[textPartIndices.length - 1]
        : textPartIndices[partIndex];

    return content.map((part, index) => {
        if (index === targetIndex && isTextContent(part)) {
            return { ...part, text: newText };
        }
        return part;
    });
}
/**
 * 追加文本到消息
 */
export function appendContentText(content: Readonly<TMessageContent>, appendText: string): TMessageContent {
    if (typeof content === 'string') {
        return content + appendText;
    }

    return [
        ...content,
        { type: 'text', text: appendText }
    ];
}

/**
 * 移除指定类型的内容
 */
export function removeContentType(
    content: Readonly<TMessageContent>,
    type: 'text' | 'image_url' | 'input_audio' | 'file'
): TMessageContent {
    if (typeof content === 'string') {
        return type === 'text' ? '' : content;
    }

    const filtered = content.filter(part => part.type !== type);

    // 如果只剩一个文本部分，简化为字符串
    if (filtered.length === 1 && isTextContent(filtered[0])) {
        return filtered[0].text;
    }

    return filtered;
}

/**
 * 统计各类型内容数量
 */
export function countContentTypes(content: Readonly<TMessageContent>): {
    text: number;
    images: number;
    audios: number;
    files: number;
} {
    if (typeof content === 'string') {
        return { text: 1, images: 0, audios: 0, files: 0 };
    }

    return {
        text: content.filter(isTextContent).length,
        images: content.filter(isImageContent).length,
        audios: content.filter(isAudioContent).length,
        files: content.filter(isFileContent).length
    };
}

/**
 * 检查消息是否包含多模态内容
 */
export function isMultimodal(content: Readonly<TMessageContent>): boolean {
    if (typeof content === 'string') return false;
    const counts = countContentTypes(content);
    return counts.images > 0 || counts.audios > 0 || counts.files > 0;
}

/**
 * 获取消息的模态类型列表
 */
export function getModalities(content: Readonly<TMessageContent>): ('text' | 'image' | 'audio' | 'file')[] {
    const modalities: Set<'text' | 'image' | 'audio' | 'file'> = new Set();

    if (typeof content === 'string') {
        modalities.add('text');
        return Array.from(modalities);
    }

    for (const part of content) {
        if (isTextContent(part)) modalities.add('text');
        else if (isImageContent(part)) modalities.add('image');
        else if (isAudioContent(part)) modalities.add('audio');
        else if (isFileContent(part)) modalities.add('file');
    }

    return Array.from(modalities);
}

// ============================================================================
// Backward Compatibility
// ============================================================================

/**
 * 兼容旧的 adaptIMessageContentGetter
 * @deprecated 使用 extractContent 代替
 */
export function adaptIMessageContentGetter(content: Readonly<TMessageContent>) {
    const extracted = extractMessageContent(content);
    return {
        text: extracted.text,
        images: extracted.images.length > 0 ? extracted.images : null
    };
}
