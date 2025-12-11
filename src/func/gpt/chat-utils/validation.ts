/*
 * 验证和兼容性检查工具
 */

import {
    isTextContent,
    isImageContent,
    isAudioContent,
    // isFileContent 
} from './msg-modal';

// ============================================================================
// Content Type Compatibility
// ============================================================================

/**
 * 内容类型到模态的映射
 */
const CONTENT_TYPE_TO_MODALITY: Record<IMessageContentPart['type'], LLMModality> = {
    'text': 'text',
    'image_url': 'image',
    'input_audio': 'audio',
    'file': 'file'
};

/**
 * 验证内容是否被模型支持
 */
export function validateContentForModel(
    content: TMessageContent,
    modelConfig: ILLMConfigV2
): {
    valid: boolean;
    unsupported: string[];
    warnings: string[];
} {
    const unsupported: string[] = [];
    const warnings: string[] = [];

    if (typeof content === 'string') {
        // 纯文本总是支持的
        return { valid: true, unsupported: [], warnings: [] };
    }

    const supportedInputModalities = modelConfig.modalities.input;

    for (const part of content) {
        const requiredModality = CONTENT_TYPE_TO_MODALITY[part.type];

        if (!supportedInputModalities.includes(requiredModality)) {
            unsupported.push(`${part.type} (需要 ${requiredModality} 支持)`);
        }

        // 特殊检查
        if (isImageContent(part)) {
            if (part.image_url.detail === 'high' && modelConfig.limits.maxContext && modelConfig.limits.maxContext < 128000) {
                warnings.push('高分辨率图片可能消耗大量 tokens，建议使用 detail: "low"');
            }
        }

        if (isAudioContent(part)) {
            // 检查音频格式支持
            const supportedFormats = ['wav', 'mp3'];
            if (!supportedFormats.includes(part.input_audio.format)) {
                warnings.push(`音频格式 ${part.input_audio.format} 可能不被支持`);
            }
        }
    }

    return {
        valid: unsupported.length === 0,
        unsupported,
        warnings
    };
}

/**
 * 检查是否支持特定能力
 */
export function checkCapability(
    modelConfig: ILLMConfigV2,
    capability: keyof ILLMConfigV2['capabilities']
): boolean {
    return modelConfig.capabilities[capability] === true;
}

/**
 * 验证 chat options 是否被模型支持
 */
export function validateChatOptions(
    options: Record<string, any>,
    modelConfig: ILLMConfigV2
): {
    valid: boolean;
    unsupported: string[];
} {
    const unsupported: string[] = [];
    const unsupportedOptions = modelConfig.options.unsupported || [];

    for (const key of Object.keys(options)) {
        if (unsupportedOptions.includes(key)) {
            unsupported.push(key);
        }
    }

    return {
        valid: unsupported.length === 0,
        unsupported
    };
}

// ============================================================================
// Content Size Validation
// ============================================================================

/**
 * 估算内容的 token 消耗
 */
export function estimateContentTokens(content: TMessageContent): {
    text: number;
    images: number;
    total: number;
} {
    if (typeof content === 'string') {
        return {
            text: estimateTextTokens(content),
            images: 0,
            total: estimateTextTokens(content)
        };
    }

    let textTokens = 0;
    let imageTokens = 0;

    for (const part of content) {
        if (isTextContent(part)) {
            textTokens += estimateTextTokens(part.text);
        } else if (isImageContent(part)) {
            // GPT-4V token 消耗估算
            const detail = part.image_url.detail || 'auto';
            if (detail === 'low') {
                imageTokens += 85;  // 低分辨率固定 85 tokens
            } else {
                // 高分辨率：170 + 额外的 tile tokens
                // 粗略估计为 500-1000 tokens
                imageTokens += 800;
            }
        }
    }

    return {
        text: textTokens,
        images: imageTokens,
        total: textTokens + imageTokens
    };
}

function estimateTextTokens(text: string): number {
    // 粗略估计：英文约 4 字符/token，中文约 2 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 2 + otherChars / 4);
}

/**
 * 检查内容是否超出模型限制
 */
export function checkContentLimits(
    content: TMessageContent,
    modelConfig: ILLMConfigV2
): {
    withinLimit: boolean;
    estimated: number;
    limit: number;
} {
    const estimated = estimateContentTokens(content).total;
    const limit = modelConfig.limits.maxContext || Infinity;

    return {
        withinLimit: estimated <= limit,
        estimated,
        limit
    };
}
