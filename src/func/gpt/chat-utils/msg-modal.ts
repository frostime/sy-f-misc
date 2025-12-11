/*
 * 多模态内容处理工具
 * 处理图片、音频、文件的转换和优化
 */

// ============================================================================
// Type Guards
// ============================================================================

export function isTextContent(part: TMessageContentPart): part is ITextContentPart {
    return part.type === 'text';
}

export function isImageContent(part: TMessageContentPart): part is IImageContentPart {
    return part.type === 'image_url';
}

export function isAudioContent(part: TMessageContentPart): part is IAudioContentPart {
    return part.type === 'input_audio';
}

export function isFileContent(part: TMessageContentPart): part is IFileContentPart {
    return part.type === 'file';
}

/*
 * 多模态内容处理工具
 * 职责分离：类型判断 → 格式转换 → 模态处理
 */

// ============================================================================
// 核心类型定义
// ============================================================================

/** 支持的输入源类型 */
export type MediaSource = Blob | File | string; // string 可以是 DataURL/HttpURL/BlobURL

/** Data URL 字符串（带 data: 前缀） */
export type DataURL = string & { readonly __brand: 'DataURL' };

/** Base64 编码字符串（纯编码，不带前缀） */
export type Base64String = string & { readonly __brand: 'Base64' };

/** HTTP(S) URL */
export type HttpURL = string & { readonly __brand: 'HttpURL' };

/** Blob URL */
export type BlobURL = string & { readonly __brand: 'BlobURL' };

// ============================================================================
// Type Guards - 类型判断
// ============================================================================

export const TypeGuards = {
    isDataURL(str: string): str is DataURL {
        return str.startsWith('data:');
    },

    isBlobURL(str: string): str is BlobURL {
        return str.startsWith('blob:');
    },

    isHttpURL(str: string): str is HttpURL {
        return /^https?:\/\//i.test(str);
    },

    isBlob(source: unknown): source is Blob {
        return source instanceof Blob;
    },

    isFile(source: unknown): source is File {
        return source instanceof File;
    }
} as const;

// ============================================================================
// Format Converter - 格式转换器（最底层）
// ============================================================================

export const FormatConverter = {
    /**
     * 统一入口：任意来源 → Blob
     * 所有处理的第一步都是先转为 Blob
     */
    async toBlob(source: MediaSource): Promise<Blob> {
        if (TypeGuards.isBlob(source)) {
            return source;
        }

        if (typeof source === 'string') {
            if (TypeGuards.isDataURL(source)) {
                return this.dataURLToBlob(source);
            }
            if (TypeGuards.isHttpURL(source) || TypeGuards.isBlobURL(source)) {
                return this.urlToBlob(source);
            }
            throw new Error(`Invalid source string: ${source.slice(0, 50)}`);
        }

        throw new Error('Unsupported source type');
    },

    /** Blob → DataURL */
    async blobToDataURL(blob: Blob): Promise<DataURL> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as DataURL);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    /** Blob → Base64 (不带前缀) */
    async blobToBase64(blob: Blob): Promise<Base64String> {
        const dataURL = await this.blobToDataURL(blob);
        return dataURL.split(',')[1] as Base64String;
    },

    /** DataURL → Blob */
    dataURLToBlob(dataURL: DataURL): Blob {
        const [header, base64data] = dataURL.split(',');
        const mimeMatch = header.match(/^data:(.*?)(;base64)?$/);
        const mimeType = mimeMatch?.[1] || 'application/octet-stream';

        const binaryData = atob(base64data);
        const bytes = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
            bytes[i] = binaryData.charCodeAt(i);
        }

        return new Blob([bytes], { type: mimeType });
    },

    /** Base64 → Blob */
    base64ToBlob(base64: Base64String, mimeType = 'application/octet-stream'): Blob {
        const dataURL = `data:${mimeType};base64,${base64}` as DataURL;
        return this.dataURLToBlob(dataURL);
    },

    /** URL (HTTP/Blob) → Blob */
    async urlToBlob(url: HttpURL | BlobURL): Promise<Blob> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        return response.blob();
    },

    /** Blob → ObjectURL */
    blobToObjectURL(blob: Blob): BlobURL {
        return URL.createObjectURL(blob) as BlobURL;
    }
} as const;

// ============================================================================
// MIME Type 工具
// ============================================================================

export const MimeUtils = {
    extractFromDataURL(dataURL: DataURL): string | null {
        const match = dataURL.match(/^data:(.*?)(;base64)?,/);
        return match?.[1] || null;
    },

    getExtension(mimeType: string): string | null {
        const map: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/svg+xml': 'svg',
            'audio/wav': 'wav',
            'audio/mpeg': 'mp3',
            'audio/mp3': 'mp3',
            'audio/webm': 'webm',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'application/pdf': 'pdf',
            'text/plain': 'txt',
            'application/json': 'json',
        };
        return map[mimeType.toLowerCase()] || null;
    },

    getMimeType(extension: string): string | null {
        const map: Record<string, string> = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'wav': 'audio/wav',
            'mp3': 'audio/mpeg',
            'webm': 'audio/webm',
            'mp4': 'video/mp4',
            'pdf': 'application/pdf',
            'txt': 'text/plain',
            'json': 'application/json',
        };
        return map[extension.toLowerCase()] || null;
    }
} as const;

// ============================================================================
// Object URL Manager
// ============================================================================

export function createObjectURLManager() {
    const urls = new Set<BlobURL>();

    return {
        create(blob: Blob): BlobURL {
            const url = FormatConverter.blobToObjectURL(blob);
            urls.add(url);
            return url;
        },

        revoke(url: BlobURL): void {
            if (urls.has(url)) {
                try {
                    URL.revokeObjectURL(url);
                    urls.delete(url);
                } catch (e) {
                    console.warn('Failed to revoke URL:', url, e);
                }
            }
        },

        revokeAll(): void {
            urls.forEach(url => {
                try {
                    URL.revokeObjectURL(url);
                } catch (e) {
                    console.warn('Failed to revoke URL:', url, e);
                }
            });
            urls.clear();
        },

        getAll(): BlobURL[] {
            return Array.from(urls);
        }
    };
}

// ============================================================================
// Image Processor - 图片处理
// ============================================================================

export interface ImageProcessOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number; // 0-1
    format?: 'jpeg' | 'png' | 'webp';
}

export interface ImageInfo {
    width: number;
    height: number;
    size: number;
    mimeType: string;
}

export const ImageProcess = {
    /**
     * 转换为 DataURL
     * 这是最常用的输出格式，适合传给 AI API
     */
    async toDataURL(source: MediaSource, options?: ImageProcessOptions): Promise<DataURL> {
        let blob = await FormatConverter.toBlob(source);

        // 如果需要处理（压缩/格式转换/尺寸调整）
        if (options && this._needsProcessing(options)) {
            blob = await this._process(blob, options);
        }

        return FormatConverter.blobToDataURL(blob);
    },

    /**
     * 转换为 Base64（不带前缀）
     */
    async toBase64(source: MediaSource, options?: ImageProcessOptions): Promise<Base64String> {
        const dataURL = await this.toDataURL(source, options);
        return dataURL.split(',')[1] as Base64String;
    },

    /**
     * 转换为 Blob
     */
    async toBlob(source: MediaSource, options?: ImageProcessOptions): Promise<Blob> {
        let blob = await FormatConverter.toBlob(source);

        if (options && this._needsProcessing(options)) {
            blob = await this._process(blob, options);
        }

        return blob;
    },

    /**
     * 获取图片信息
     */
    async getInfo(source: MediaSource): Promise<ImageInfo> {
        const blob = await FormatConverter.toBlob(source);
        const img = await this._loadImage(blob);

        return {
            width: img.naturalWidth,
            height: img.naturalHeight,
            size: blob.size,
            mimeType: blob.type
        };
    },

    /**
     * 创建缩略图
     */
    async createThumbnail(
        source: MediaSource,
        maxSize: number = 200
    ): Promise<DataURL> {
        return this.toDataURL(source, {
            maxWidth: maxSize,
            maxHeight: maxSize,
            quality: 0.8,
            format: 'jpeg'
        });
    },

    // ---- 私有方法 ----

    _needsProcessing(options: ImageProcessOptions): boolean {
        return !!(
            options.maxWidth ||
            options.maxHeight ||
            options.quality ||
            options.format
        );
    },

    async _process(blob: Blob, options: ImageProcessOptions): Promise<Blob> {
        const img = await this._loadImage(blob);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        let { width, height } = img;
        const { maxWidth = width, maxHeight = height } = options;

        // 计算缩放
        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }
        if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
        }

        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        return new Promise((resolve, reject) => {
            const mimeType = `image/${options.format || 'jpeg'}`;
            canvas.toBlob(
                (resultBlob) => {
                    if (resultBlob) {
                        resolve(resultBlob);
                    } else {
                        reject(new Error('Canvas to blob conversion failed'));
                    }
                },
                mimeType,
                options.quality ?? 0.9
            );
        });
    },

    _loadImage(blob: Blob): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);

            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };

            img.src = url;
        });
    }
} as const;

// ============================================================================
// Audio Processor - 音频处理
// ============================================================================

export interface AudioProcessOptions {
    format?: 'wav' | 'mp3';
}

export interface AudioInfo {
    size: number;
    mimeType: string;
    format: 'wav' | 'mp3' | 'unknown';
}

export const AudioProcess = {
    /**
     * 转换为 Base64（AI API 常用格式）
     */
    async toBase64(source: MediaSource, options?: AudioProcessOptions): Promise<{
        data: Base64String;
        format: 'wav' | 'mp3';
    }> {
        const blob = await FormatConverter.toBlob(source);
        const base64 = await FormatConverter.blobToBase64(blob);

        // 推断格式
        let format: 'wav' | 'mp3' = options?.format || 'mp3';
        if (blob.type.includes('wav')) format = 'wav';
        else if (blob.type.includes('mp3') || blob.type.includes('mpeg')) format = 'mp3';

        return { data: base64, format };
    },

    /**
     * 转换为 Blob
     */
    async toBlob(source: MediaSource): Promise<Blob> {
        return FormatConverter.toBlob(source);
    },

    /**
     * 获取音频信息
     */
    async getInfo(source: MediaSource): Promise<AudioInfo> {
        const blob = await FormatConverter.toBlob(source);

        let format: 'wav' | 'mp3' | 'unknown' = 'unknown';
        if (blob.type.includes('wav')) format = 'wav';
        else if (blob.type.includes('mp3') || blob.type.includes('mpeg')) format = 'mp3';

        return {
            size: blob.size,
            mimeType: blob.type,
            format
        };
    }
} as const;

// ============================================================================
// File Processor - 通用文件处理
// ============================================================================

export interface FileProcessOptions {
    maxSize?: number; // bytes
}

export interface FileInfo {
    size: number;
    mimeType: string;
    filename?: string;
    extension?: string;
}

export const FileProcess = {
    /**
     * 转换为 Base64
     */
    async toBase64(source: MediaSource, options?: FileProcessOptions): Promise<{
        data: Base64String;
        filename?: string;
        mimeType: string;
    }> {
        const blob = await FormatConverter.toBlob(source);

        // 检查大小限制
        if (options?.maxSize && blob.size > options.maxSize) {
            throw new Error(
                `File size ${formatFileSize(blob.size)} exceeds limit ${formatFileSize(options.maxSize)}`
            );
        }

        const base64 = await FormatConverter.blobToBase64(blob);

        // 提取文件名
        let filename: string | undefined;
        if (source instanceof File) {
            filename = source.name;
        } else if (typeof source === 'string' && TypeGuards.isHttpURL(source)) {
            const urlParts = source.split('/');
            filename = urlParts[urlParts.length - 1].split('?')[0]; // 移除查询参数
        }

        return {
            data: base64,
            filename,
            mimeType: blob.type || 'application/octet-stream'
        };
    },

    /**
     * 转换为 Blob
     */
    async toBlob(source: MediaSource): Promise<Blob> {
        return FormatConverter.toBlob(source);
    },

    /**
     * 获取文件信息
     */
    async getInfo(source: MediaSource): Promise<FileInfo> {
        const blob = await FormatConverter.toBlob(source);

        let filename: string | undefined;
        if (source instanceof File) {
            filename = source.name;
        }

        const extension = filename
            ? filename.split('.').pop()
            : MimeUtils.getExtension(blob.type) || undefined;

        return {
            size: blob.size,
            mimeType: blob.type,
            filename,
            extension
        };
    }
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// ============================================================================
// 使用示例
// ============================================================================

/*
// 图片处理
const dataURL = await ImageProcess.toDataURL(file, {
    maxWidth: 1920,
    quality: 0.85,
    format: 'jpeg'
});

const info = await ImageProcess.getInfo(dataURL);
console.log(info); // { width, height, size, mimeType }

const thumbnail = await ImageProcess.createThumbnail(file, 200);

// 音频处理
const { data, format } = await AudioProcess.toBase64(audioBlob);

// 文件处理
const fileData = await FileProcess.toBase64(pdfFile, { maxSize: 10 * 1024 * 1024 });

// 底层转换
const blob = await FormatConverter.toBlob(dataURL);
const base64 = await FormatConverter.blobToBase64(blob);
*/
