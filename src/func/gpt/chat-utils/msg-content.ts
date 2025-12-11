/*
 * 内容提取器 - 从消息中提取和解析各类内容
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
    images: string[];
    audios: Array<{ data: string; format: 'wav' | 'mp3' }>;
    files: Array<{ data?: string; id?: string; filename?: string }>;
}

/**
 * 从消息内容中提取各类媒体
 */
export function extractMessageContent(content: TMessageContent): ExtractedContent {
    const result: ExtractedContent = {
        text: '',
        images: [],
        audios: [],
        files: []
    };

    if (typeof content === 'string') {
        result.text = content;
        return result;
    }

    for (const part of content) {
        if (isTextContent(part)) {
            result.text += (result.text ? '\n' : '') + part.text;
        } else if (isImageContent(part)) {
            result.images.push(part.image_url.url);
        } else if (isAudioContent(part)) {
            result.audios.push({
                data: part.input_audio.data,
                format: part.input_audio.format
            });
        } else if (isFileContent(part)) {
            result.files.push({
                data: part.file.file_data,
                id: part.file.file_id,
                filename: part.file.filename
            });
        }
    }

    return result;
}

/**
 * 从消息中提取纯文本
 */
export function extractText(content: TMessageContent): string {
    if (typeof content === 'string') return content;

    return content
        .filter(isTextContent)
        .map(part => part.text)
        .join('\n');
}

/**
 * 从消息中提取图片 URLs
 */
export function extractImages(content: TMessageContent): string[] {
    if (typeof content === 'string') return [];

    return content
        .filter(isImageContent)
        .map(part => part.image_url.url);
}

/**
 * 从消息中提取音频
 */
export function extractAudios(content: TMessageContent): Array<{ data: string; format: 'wav' | 'mp3' }> {
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
export function extractFiles(content: TMessageContent): Array<{ data?: string; id?: string; filename?: string }> {
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
 */
export function updateText(content: TMessageContent, newText: string): TMessageContent {
    if (typeof content === 'string') {
        return newText;
    }

    const newContent: IMessageContentPart[] = content.map(part => {
        if (isTextContent(part)) {
            return { ...part, text: newText };
        }
        return part;
    });

    // 如果没有文本部分，添加一个
    if (!newContent.some(isTextContent)) {
        newContent.unshift({ type: 'text', text: newText });
    }

    return newContent;
}

/**
 * 追加文本到消息
 */
export function appendText(content: TMessageContent, appendText: string): TMessageContent {
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
    content: TMessageContent,
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
export function countContentTypes(content: TMessageContent): {
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
export function isMultimodal(content: TMessageContent): boolean {
    if (typeof content === 'string') return false;
    const counts = countContentTypes(content);
    return counts.images > 0 || counts.audios > 0 || counts.files > 0;
}

/**
 * 获取消息的模态类型列表
 */
export function getModalities(content: TMessageContent): ('text' | 'image' | 'audio' | 'file')[] {
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
export function adaptIMessageContentGetter(content: TMessageContent) {
    const extracted = extractMessageContent(content);
    return {
        text: extracted.text,
        images: extracted.images.length > 0 ? extracted.images : null
    };
}
