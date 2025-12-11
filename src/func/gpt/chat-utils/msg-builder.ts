/*
 * 消息构建器 - 提供链式 API 构建多模态消息
 */


import {
    imageToBase64,
    audioToBase64,
    fileToBase64,
    type ImageProcessOptions,
    type AudioProcessOptions,
    type FileProcessOptions
} from './msg-modal';

// ============================================================================
// Message Builder
// ============================================================================

export class MessageBuilder {
    private parts: IMessageContentPart[] = [];

    /**
     * 添加文本
     */
    addText(content: string): this {
        this.parts.push({ type: 'text', text: content });
        return this;
    }

    /**
     * 添加图片
     */
    async addImage(
        source: Blob | File | string,
        options?: ImageProcessOptions & { detail?: 'auto' | 'low' | 'high' }
    ): Promise<this> {
        const url = await imageToBase64(source, options);
        this.parts.push({
            type: 'image_url',
            image_url: {
                url,
                detail: options?.detail
            }
        });
        return this;
    }

    /**
     * 批量添加图片
     */
    async addImages(
        sources: (Blob | File | string)[],
        options?: ImageProcessOptions & { detail?: 'auto' | 'low' | 'high' }
    ): Promise<this> {
        for (const source of sources) {
            await this.addImage(source, options);
        }
        return this;
    }

    /**
     * 添加音频
     */
    async addAudio(
        source: Blob | File | string,
        options?: AudioProcessOptions
    ): Promise<this> {
        const { data, format } = await audioToBase64(source, options);
        this.parts.push({
            type: 'input_audio',
            input_audio: { data, format }
        });
        return this;
    }

    /**
     * 添加文件
     */
    async addFile(
        source: Blob | File | string,
        options?: FileProcessOptions & { file_id?: string }
    ): Promise<this> {
        if (options?.file_id) {
            // 使用已上传的文件 ID
            this.parts.push({
                type: 'file',
                file: { file_id: options.file_id }
            });
        } else {
            // 使用 base64 编码
            const { data, filename } = await fileToBase64(source, options);
            this.parts.push({
                type: 'file',
                file: { file_data: data, filename }
            });
        }
        return this;
    }

    /**
     * 构建用户消息
     */
    buildUser(name?: string): IUserMessage {
        return {
            role: 'user',
            content: this.parts.length === 1 && this.parts[0].type === 'text'
                ? this.parts[0].text
                : this.parts,
            name
        };
    }

    /**
     * 构建系统消息（只能是纯文本）
     */
    buildSystem(name?: string): ISystemMessage {
        const textParts = this.parts.filter(p => p.type === 'text');
        const text = textParts.map(p => (p as any).text).join('\n');
        return {
            role: 'system',
            content: text,
            name
        };
    }

    /**
     * 获取原始内容
     */
    getContent(): TMessageContent {
        if (this.parts.length === 0) return '';
        if (this.parts.length === 1 && this.parts[0].type === 'text') {
            return (this.parts[0] as any).text;
        }
        return this.parts;
    }

    extractContentText(): string {
        const textParts = this.parts.filter(p => p.type === 'text');
        return textParts.map(p => (p as any).text).join('\n');
    }

    /**
     * 清空内容
     */
    clear(): this {
        this.parts = [];
        return this;
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 创建消息构建器
 */
export function createMessage(): MessageBuilder {
    return new MessageBuilder();
}

/**
 * 快速创建纯文本用户消息
 */
export function userMessage(text: string, name?: string): IUserMessage {
    return { role: 'user', content: text, name };
}

/**
 * 快速创建系统消息
 */
export function systemMessage(text: string, name?: string): ISystemMessage {
    return { role: 'system', content: text, name };
}

/**
 * 快速创建助手消息
 */
export function assistantMessage(text: string, name?: string): IAssistantMessage {
    return { role: 'assistant', content: text, name };
}

/**
 * 批量构建图文消息
 */
export async function createImageTextMessage(
    text: string,
    images: (Blob | File | string)[],
    options?: {
        name?: string;
        imageOptions?: ImageProcessOptions & { detail?: 'auto' | 'low' | 'high' };
    }
): Promise<IUserMessage> {
    const builder = createMessage();
    builder.addText(text);
    await builder.addImages(images, options?.imageOptions);
    return builder.buildUser(options?.name);
}
