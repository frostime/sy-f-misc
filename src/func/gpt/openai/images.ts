import { appendLog } from "../MessageLogger";

// ============================================================================
// Image Generation Types
// ============================================================================

export interface IImageGenerationOptions {
    prompt: string;
    model?: string;
    response_format?: "url" | "b64_json";
    size?: string;
    quality?: "auto" | "standard" | "hd" | "high" | "medium" | "low";
    style?: "vivid" | "natural";
    user?: string;
    [key: string]: any;
}

export interface IImageEditOptions {
    image: File | Blob;
    prompt: string;
    model?: string;
    response_format?: "url" | "b64_json";
    size?: string;
    background?: 'transparent' | 'opaque' | 'auto';
    mask?: File | Blob;
    user?: string;
    [key: string]: any;
}

export interface IImageResult {
    ok?: boolean;
    images: Array<{
        url?: string;
        b64_json?: string;
        revised_prompt?: string;
    }>;
    error?: string;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
    };
    output_format?: string;
    quality?: string;
    size?: string;
}

// ============================================================================
// Image Generation Implementation
// ============================================================================

/**
 * Generate images using DALL-E
 * @param runtimeModel - Runtime LLM configuration
 * @param options - Image generation options
 * @returns Promise with generated image results
 */
export const generateImage = async (
    runtimeModel: IRuntimeLLM,
    options: IImageGenerationOptions
): Promise<IImageResult> => {
    if (!runtimeModel) {
        return {
            ok: false,
            images: [],
            error: 'Error: 无法获取图像生成模型，请先在设置中添加并选择一个模型。'
        };
    }

    try {
        const { url: fullUrl, apiKey, provider } = runtimeModel;

        const knownParams = ['prompt', 'model', 'response_format', 'quality', 'style', 'user'];
        // Build request payload
        const payload: any = {
            prompt: options.prompt,
            model: runtimeModel.model,
            response_format: options.response_format || 'url',
            // size: options.size || '1024x1024'
        };

        // Add optional parameters
        if (options.quality) payload.quality = options.quality;
        if (options.style) payload.style = options.style;
        if (options.user) payload.user = options.user;

        // Add custom parameters
        Object.keys(options).forEach(key => {
            if (!knownParams.includes(key)) {
                console.log(`[Image Generation] Custom parameter passed: ${key}`, options[key]);
                payload[key] = options[key];
            }
        });

        appendLog({ type: 'request', data: payload });

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...(provider?.customHeaders || {})
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            appendLog({ type: 'response', data: errorData });
            return {
                ok: false,
                images: [],
                error: errorData ? JSON.stringify(errorData) : `HTTP error! status: ${response.status}`
            };
        }

        const data = await response.json();
        appendLog({ type: 'response', data });

        return {
            ok: true,
            images: data.data.map((item: any) => ({
                url: item.url,
                b64_json: item.b64_json,
                revised_prompt: item.revised_prompt
            })),
            usage: data.usage,
            output_format: data.output_format,
            quality: data.quality,
            size: data.size
        };

    } catch (error) {
        return {
            ok: false,
            images: [],
            error: `Failed to generate image: ${error}`
        };
    }
};

/**
 * Edit images using DALL-E
 * @param runtimeModel - Runtime LLM configuration
 * @param options - Image edit options
 * @returns Promise with edited image results
 */
export const editImage = async (
    runtimeModel: IRuntimeLLM,
    options: IImageEditOptions
): Promise<IImageResult> => {
    if (!runtimeModel) {
        return {
            ok: false,
            images: [],
            error: 'Error: 无法获取图像编辑模型，请先在设置中添加并选择一个模型。'
        };
    }

    try {
        const { url: fullUrl, apiKey, provider } = runtimeModel;

        const knownParams = ['image', 'prompt', 'mask', 'model', 'size', 'background', 'response_format', 'user'];

        // Build FormData for multipart/form-data request
        const formData = new FormData();
        formData.append('image', options.image);
        formData.append('prompt', options.prompt);

        if (options.mask) formData.append('mask', options.mask);
        if (options.model) formData.append('model', runtimeModel.model);
        if (options.size) formData.append('size', options.size);
        if (options.background) formData.append('background', options.background);
        if (options.response_format) formData.append('response_format', options.response_format);
        if (options.user) formData.append('user', options.user);

        // Add custom parameters
        Object.keys(options).forEach(key => {
            if (!knownParams.includes(key)) {
                console.log(`[Image Edit] Custom parameter passed: ${key}`, options[key]);
                formData.append(key, options[key]);
            }
        });

        appendLog({ type: 'request', data: { prompt: options.prompt, hasImage: true, hasMask: !!options.mask } });

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...(provider?.customHeaders || {})
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            appendLog({ type: 'response', data: errorData });
            return {
                ok: false,
                images: [],
                error: errorData ? JSON.stringify(errorData) : `HTTP error! status: ${response.status}`
            };
        }

        const data = await response.json();
        appendLog({ type: 'response', data });

        return {
            ok: true,
            images: data.data.map((item: any) => ({
                url: item.url,
                b64_json: item.b64_json
            })),
            usage: data.usage,
            output_format: data.output_format,
            quality: data.quality,
            size: data.size
        };

    } catch (error) {
        return {
            ok: false,
            images: [],
            error: `Failed to edit image: ${error}`
        };
    }
};

// ============================================================================
// Conversion to ICompletionResult
// ============================================================================

/**
 * Convert IImageResult to ICompletionResult for display in chat
 * @param imageResult - Image generation/edit result
 * @param options - Conversion options
 * @returns ICompletionResult with embedded images and download links
 */
export const imageResultToCompletion = (
    imageResult: IImageResult,
    options?: {
        showRevisedPrompt?: boolean;
        imageTitle?: string;
    }
): ICompletionResult => {
    if (!imageResult.ok) {
        return {
            ok: false,
            content: `**图像生成失败**\n\n${imageResult.error}`,
            usage: null
        };
    }

    const lines: string[] = [];

    // Add title if provided
    if (options?.imageTitle) {
        lines.push(`### ${options.imageTitle}\n`);
    }

    // Add each image
    imageResult.images.forEach((img, index) => {
        const imageNum = imageResult.images.length > 1 ? ` ${index + 1}` : '';

        // Show revised prompt if available and requested
        if (options?.showRevisedPrompt && img.revised_prompt) {
            lines.push(`**修订后的提示词${imageNum}**: ${img.revised_prompt}\n`);
        }

        // Embed image
        if (img.url) {
            lines.push(`![生成的图像${imageNum}](${img.url})\n`);
            lines.push(`[🔗 下载图像${imageNum}](${img.url})\n`);
        } else if (img.b64_json) {
            const dataUrl = `data:image/png;base64,${img.b64_json}`;
            lines.push(`![生成的图像${imageNum}](${dataUrl})\n`);
            lines.push(`[🔗 下载图像${imageNum}](${dataUrl})\n`);
        }
    });

    // Add metadata if available
    const metadata: string[] = [];
    if (imageResult.quality) metadata.push(`质量: ${imageResult.quality}`);
    if (imageResult.size) metadata.push(`尺寸: ${imageResult.size}`);
    if (imageResult.output_format) metadata.push(`格式: ${imageResult.output_format}`);

    if (metadata.length > 0) {
        lines.push(`\n*${metadata.join(' | ')}*`);
    }

    // Convert usage if available
    const usage = imageResult.usage ? {
        completion_tokens: imageResult.usage.output_tokens || 0,
        prompt_tokens: imageResult.usage.input_tokens || 0,
        total_tokens: imageResult.usage.total_tokens || 0
    } : null;

    return {
        ok: true,
        content: lines.join('\n'),
        usage
    };
};
