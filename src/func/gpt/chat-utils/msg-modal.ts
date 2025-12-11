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

// ============================================================================
// URL Utilities
// ============================================================================

export function isDataURL(str: string): boolean {
    return typeof str === 'string' && str.startsWith('data:');
}

export function isBlobURL(str: string): boolean {
    return typeof str === 'string' && str.startsWith('blob:');
}

export function isHttpURL(str: string): boolean {
    return typeof str === 'string' && /^https?:\/\//i.test(str);
}

export function getMimeTypeFromDataURL(dataURL: string): string | null {
    const match = dataURL.match(/^data:(.*?)(;base64)?,/);
    return match ? match[1] : null;
}

export function getExtensionFromMimeType(mimeType: string): string | null {
    const map: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'audio/wav': 'wav',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'application/pdf': 'pdf',
        'text/plain': 'txt',
    };
    return map[mimeType.toLowerCase()] || null;
}

// ============================================================================
// Object URL Manager
// ============================================================================

export interface ObjectURLManager {
    create(blob: Blob): string;
    revoke(url: string): void;
    revokeAll(): void;
    getAll(): string[];
}

export function createObjectURLManager(): ObjectURLManager {
    const urls = new Set<string>();

    return {
        create(blob: Blob): string {
            const url = URL.createObjectURL(blob);
            urls.add(url);
            return url;
        },

        revoke(url: string): void {
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

        getAll(): string[] {
            return Array.from(urls);
        }
    };
}

// ============================================================================
// Image Processing
// ============================================================================

export interface ImageProcessOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;  // 0-1
    format?: 'jpeg' | 'png' | 'webp';
}

/**
 * 将图片转换为 base64 data URL
 */
export async function imageToBase64(
    source: Blob | File | string,
    options?: ImageProcessOptions
): Promise<string> {
    let blob: Blob;

    if (source instanceof Blob) {
        blob = source;
    } else if (typeof source === 'string') {
        if (isDataURL(source)) {
            if (!options?.maxWidth && !options?.maxHeight && !options?.quality) {
                return source;  // 已经是 data URL 且不需要处理
            }
            blob = await dataURLToBlob(source);
        } else if (isHttpURL(source) || isBlobURL(source)) {
            const response = await fetch(source);
            blob = await response.blob();
        } else {
            throw new Error('Invalid image source');
        }
    } else {
        throw new Error('Invalid image source type');
    }

    // 如果需要调整大小或质量
    if (options?.maxWidth || options?.maxHeight || options?.quality || options?.format) {
        blob = await resizeImage(blob, options);
    }

    return blobToDataURL(blob);
}

/**
 * data URL 转 Blob
 */
export async function dataURLToBlob(dataURL: string): Promise<Blob> {
    const [header, base64data] = dataURL.split(',');
    const mimeType = getMimeTypeFromDataURL(dataURL) || 'image/jpeg';

    const binaryData = atob(base64data);
    const bytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
}

/**
 * Blob 转 data URL
 */
export function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * 调整图片大小
 */
async function resizeImage(blob: Blob, options: ImageProcessOptions): Promise<Blob> {
    const img = await blobToImage(blob);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    let { width, height } = img;
    const { maxWidth = width, maxHeight = height } = options;

    // 计算缩放比例
    if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
    }
    if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    return new Promise((resolve, reject) => {
        const mimeType = `image/${options.format || 'jpeg'}`;
        canvas.toBlob(
            (resultBlob) => {
                if (resultBlob) {
                    resolve(resultBlob);
                } else {
                    reject(new Error('Failed to convert canvas to blob'));
                }
            },
            mimeType,
            options.quality ?? 0.9
        );
    });
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
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

/**
 * 获取图片尺寸
 */
export async function getImageDimensions(
    source: Blob | File | string
): Promise<{ width: number; height: number }> {
    let blob: Blob;

    if (source instanceof Blob) {
        blob = source;
    } else if (typeof source === 'string') {
        if (isDataURL(source)) {
            blob = await dataURLToBlob(source);
        } else {
            const response = await fetch(source);
            blob = await response.blob();
        }
    } else {
        throw new Error('Invalid image source');
    }

    const img = await blobToImage(blob);
    return { width: img.naturalWidth, height: img.naturalHeight };
}

// ============================================================================
// Audio Processing
// ============================================================================

export interface AudioProcessOptions {
    format?: 'wav' | 'mp3';
}

/**
 * 将音频转换为 base64
 */
export async function audioToBase64(
    source: Blob | File | string,
    options?: AudioProcessOptions
): Promise<{ data: string; format: 'wav' | 'mp3' }> {
    let blob: Blob;
    let format: 'wav' | 'mp3' = options?.format || 'mp3';

    if (source instanceof Blob) {
        blob = source;
        // 从 MIME 类型推断格式
        if (blob.type.includes('wav')) format = 'wav';
        else if (blob.type.includes('mp3') || blob.type.includes('mpeg')) format = 'mp3';
    } else if (typeof source === 'string') {
        if (isDataURL(source)) {
            blob = await dataURLToBlob(source);
            const mimeType = getMimeTypeFromDataURL(source);
            if (mimeType?.includes('wav')) format = 'wav';
        } else {
            const response = await fetch(source);
            blob = await response.blob();
        }
    } else {
        throw new Error('Invalid audio source');
    }

    const dataURL = await blobToDataURL(blob);
    const base64data = dataURL.split(',')[1];

    return { data: base64data, format };
}

// ============================================================================
// File Processing
// ============================================================================

export interface FileProcessOptions {
    maxSize?: number;  // bytes
}

/**
 * 将文件转换为 base64
 */
export async function fileToBase64(
    source: Blob | File | string,
    options?: FileProcessOptions
): Promise<{ data: string; filename?: string; mimeType?: string }> {
    let blob: Blob;
    let filename: string | undefined;

    if (source instanceof File) {
        blob = source;
        filename = source.name;
    } else if (source instanceof Blob) {
        blob = source;
    } else if (typeof source === 'string') {
        if (isDataURL(source)) {
            const base64data = source.split(',')[1];
            const mimeType = getMimeTypeFromDataURL(source);
            return { data: base64data, mimeType: mimeType || undefined };
        } else {
            const response = await fetch(source);
            blob = await response.blob();
            // 从 URL 提取文件名
            const urlParts = source.split('/');
            filename = urlParts[urlParts.length - 1];
        }
    } else {
        throw new Error('Invalid file source');
    }

    // 检查文件大小
    if (options?.maxSize && blob.size > options.maxSize) {
        throw new Error(`File size exceeds maximum: ${blob.size} > ${options.maxSize}`);
    }

    const dataURL = await blobToDataURL(blob);
    const base64data = dataURL.split(',')[1];

    return {
        data: base64data,
        filename,
        mimeType: blob.type || undefined
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export async function getMediaSize(source: Blob | File | string): Promise<number> {
    if (source instanceof Blob) {
        return source.size;
    } else if (typeof source === 'string') {
        if (isDataURL(source)) {
            const blob = await dataURLToBlob(source);
            return blob.size;
        } else {
            const response = await fetch(source);
            const blob = await response.blob();
            return blob.size;
        }
    }
    throw new Error('Invalid media source');
}
