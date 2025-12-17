/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-13
 * @FilePath     : /src/func/gpt/chat/ChatSession/use-attachment-input.ts
 * @LastEditTime : 2025-12-17 21:41:06
 * @Description  : 统一处理文件输入的 Hook (paste/drag/drop)
 */

import { Accessor } from 'solid-js';
import { showMessage, Constants } from 'siyuan';
import { checkSupportsModality } from '@/func/gpt/model/store';
import { executeContextProviderDirect } from '@gpt/context-provider';
import SelectedTextProvider from '@gpt/context-provider/SelectedTextProvider';
import BlocksProvider from '@gpt/context-provider/BlocksProvider';
import { truncateContent } from '@gpt/tools/utils';
import { IStoreRef, useSignalRef } from '@frostime/solid-signal-ref';
import { ImageProcess, AudioProcess, FileProcess } from '@gpt/chat-utils/msg-modal';

// ================================================================
// 文件类型配置
// ================================================================

/**
 * 文件分类类型
 * - image: 图片附件 (多模态)
 * - audio: 音频附件 (多模态)
 * - file: 文件附件 (多模态) - PDF、DOC等
 * - text: 纯文本上下文 (转为 context，不是附件)
 */
type FileCategory = 'image' | 'audio' | 'file' | 'text';

/**
 * 文件类型配置
 */
const FILE_TYPE_CONFIG: Record<FileCategory, {
    extensions: string[];
    mimePrefix: string | null;
    maxSize: number;
    acceptPattern: string;
}> = {
    image: {
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'],
        mimePrefix: 'image/',
        maxSize: 10 * 1024 * 1024, // 10MB
        acceptPattern: 'image/*'
    },
    audio: {
        extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
        mimePrefix: 'audio/',
        maxSize: 25 * 1024 * 1024, // 25MB
        acceptPattern: 'audio/*'
    },
    file: {
        extensions: ['pdf', 'doc', 'docx'],
        mimePrefix: null,
        maxSize: 20 * 1024 * 1024, // 20MB
        acceptPattern: '.pdf,.doc,.docx'
    },
    text: {
        extensions: [
            'txt', 'md', 'markdown',
            'py', 'ts', 'js', 'jsx', 'tsx',
            'json', 'yaml', 'yml', 'toml',
            'xml', 'html', 'css', 'scss',
            'c', 'cpp', 'h', 'java', 'go', 'rs'
        ],
        mimePrefix: 'text/',
        maxSize: 2 * 1024 * 1024, // 2MB
        acceptPattern: '.txt,.md,.markdown,.py,.ts,.js,.jsx,.tsx,.json,.yaml,.yml,.toml,.xml,.html,.css,.scss,.c,.cpp,.h,.java,.go,.rs'
    }
};

/**
 * 文件分类结果
 */
interface FileClassification {
    imageFiles: File[];
    audioFiles: File[];
    fileAttachments: File[];  // 改名：file modality 的附件
    textFiles: File[];        // 纯文本文件，转为 context
}

// ================================================================
// 接口定义
// ================================================================

interface AttachmentInputOptions {
    modelId: Accessor<string>;
    addAttachment: (part: TMessageContentPart) => void;
    setContext: (context: IProvidedContext) => void;
}

/**
 * 上下文和附件管理相关的 hook
 */
export const useContextAndAttachments = (params: {
    contexts: IStoreRef<IProvidedContext[]>;
    multiModalAttachments: ReturnType<typeof useSignalRef<TMessageContentPart[]>>;
}) => {
    const { contexts, multiModalAttachments } = params;

    const setContext = (context: IProvidedContext) => {
        const currentIds = contexts().map(c => c.id);
        if (currentIds.includes(context.id)) {
            const index = currentIds.indexOf(context.id);
            contexts.update(index, context);
        } else {
            contexts.update(prev => [...prev, context]);
        }
    }

    const delContext = (id: IProvidedContext['id']) => {
        contexts.update(prev => prev.filter(c => c.id !== id));
    }

    /**
     * 移除多模态附件（通过索引）
     */
    const removeAttachment = (index: number) => {
        multiModalAttachments.update((prev: TMessageContentPart[]) => prev.filter((_, i) => i !== index));
    }

    /**
     * 添加多模态附件
     */
    const addAttachment = (part: TMessageContentPart) => {
        multiModalAttachments.update((prev: TMessageContentPart[]) => [...prev, part]);
    }

    return {
        setContext,
        delContext,
        removeAttachment,
        addAttachment
    };
};

// ================================================================
// 工具函数
// ================================================================

/**
 * 根据文件名和 MIME 类型判断文件分类
 */
const detectFileCategory = (file: File): FileCategory | null => {
    const mimeType = file.type || '';
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    // 按照 MIME 类型前缀判断
    for (const [category, config] of Object.entries(FILE_TYPE_CONFIG)) {
        if (config.mimePrefix && mimeType.startsWith(config.mimePrefix)) {
            return category as FileCategory;
        }
    }

    // 按照扩展名判断
    for (const [category, config] of Object.entries(FILE_TYPE_CONFIG)) {
        if (config.extensions.includes(ext)) {
            return category as FileCategory;
        }
    }

    return null;
};

/**
 * 检查文件大小是否超过限制
 */
const checkFileSize = (file: File, category: FileCategory): boolean => {
    const maxSize = FILE_TYPE_CONFIG[category].maxSize;
    if (file.size > maxSize) {
        const sizeMB = (maxSize / 1024 / 1024).toFixed(0);
        showMessage(`文件过大 (>${sizeMB}MB): ${file.name}`);
        return false;
    }
    return true;
};

/**
 * 读取文本文件内容
 */
const readTextContent = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            resolve(result);
        };
        reader.onerror = () => {
            reject(reader.error);
        };
        reader.readAsText(file);
    });
};

/**
 * 根据模型支持的 modality 获取 accept 模式字符串
 */
export const getAcceptPattern = (modelId: string): string => {
    // const acceptPatterns: string[] = [];
    const acceptPatterns: Set<string> = new Set();

    if (checkSupportsModality(modelId, 'image', 'input')) {
        acceptPatterns.add(FILE_TYPE_CONFIG.image.acceptPattern);
    }
    if (checkSupportsModality(modelId, 'audio', 'input')) {
        acceptPatterns.add(FILE_TYPE_CONFIG.audio.acceptPattern);
    }
    if (checkSupportsModality(modelId, 'file', 'input')) {
        acceptPatterns.add(FILE_TYPE_CONFIG.file.acceptPattern);
        acceptPatterns.add(FILE_TYPE_CONFIG.text.acceptPattern);
    }

    if (checkSupportsModality(modelId, 'text', 'input')) {
        acceptPatterns.add(FILE_TYPE_CONFIG.text.acceptPattern);
    }

    // return acceptPatterns.join(',');
    return Array.from(acceptPatterns).join(',');
};

/**
 * 检查模型是否支持文件输入
 */
export const checkModelSupportsFileInput = (modelId: string): boolean => {
    return (
        checkSupportsModality(modelId, 'image', 'input') ||
        checkSupportsModality(modelId, 'audio', 'input') ||
        checkSupportsModality(modelId, 'file', 'input')
    );
};

// ================================================================
// 主 Hook
// ================================================================

export const useAttachmentInputHandler = (options: AttachmentInputOptions) => {
    const { modelId, addAttachment, setContext } = options;

    // ================================================================
    // Helper Function
    // ================================================================

    /**
     * 分类处理不同类型的文件
     */
    const classifyFiles = (files: File[]): FileClassification => {
        const currentModelId = modelId();
        const imageFiles: File[] = [];
        const audioFiles: File[] = [];
        const fileAttachments: File[] = [];
        const textFiles: File[] = [];

        for (const file of files) {
            const category = detectFileCategory(file);

            if (!category) {
                showMessage(`不支持的文件类型: ${file.name}`);
                continue;
            }

            // 检查文件大小
            if (!checkFileSize(file, category)) {
                continue;
            }

            // 根据分类和模型支持情况分配文件
            switch (category) {
                case 'image':
                    if (checkSupportsModality(currentModelId, 'image', 'input')) {
                        imageFiles.push(file);
                    } else {
                        showMessage(`当前模型不支持图片输入: ${file.name}`);
                    }
                    break;

                case 'audio':
                    if (checkSupportsModality(currentModelId, 'audio', 'input')) {
                        audioFiles.push(file);
                    } else {
                        showMessage(`当前模型不支持音频输入: ${file.name}`);
                    }
                    break;

                case 'file':
                    if (checkSupportsModality(currentModelId, 'file', 'input')) {
                        fileAttachments.push(file);
                    } else {
                        showMessage(`当前模型不支持文件输入: ${file.name}`);
                    }
                    break;

                case 'text':
                    // 文本文件总是转为 context，不需要检查 modality
                    textFiles.push(file);
                    break;
            }
        }

        return { imageFiles, audioFiles, fileAttachments, textFiles };
    };

    /**
     * 处理文本文件为 context
     */
    const processTextFiles = async (files: File[]) => {
        for (const file of files) {
            try {
                let content = await readTextContent(file);
                if (content.length > 10000) {
                    const len = content.length;
                    const result = truncateContent(content, 10000);
                    content = result.content;
                    if (result.isTruncated) {
                        content += `\n\n...（内容过长，已截断，原始长度 ${len} 字符）`;
                    }
                }
                const context: IProvidedContext = {
                    id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`,
                    name: 'ReadLocalFile',
                    displayTitle: '本地文件',
                    description: '用户提交的本地文件内容',
                    contextItems: [
                        {
                            name: file.name,
                            description: `${file.name}的内容`,
                            content: content
                        }
                    ]
                };
                setContext(context);
            } catch (error) {
                console.error('文件读取失败:', error);
                showMessage(`文件读取失败: ${file.name}`);
            }
        }
    };

    /**
     * 处理思源块拖放
     */
    const handleSiYuanDrop = async (type: string) => {
        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
            const meta = type.replace(Constants.SIYUAN_DROP_GUTTER, '');
            const info = meta.split(Constants.ZWSP);
            const nodeIds = info[2].split(',');
            if (nodeIds.length > 1) {
                const context = await executeContextProviderDirect(SelectedTextProvider, {
                    query: ''
                });
                setContext(context);
            } else if (nodeIds.length === 1) {
                const id = nodeIds[0];
                const context = await executeContextProviderDirect(BlocksProvider, {
                    query: id
                });
                setContext(context);
            }
        }
    };

    /**
     * 处理思源标签页拖放
     */
    const handleSiYuanTabDrop = async (dataTransfer: DataTransfer) => {
        const data = dataTransfer.getData(Constants.SIYUAN_DROP_TAB);
        const payload = JSON.parse(data);
        const rootId = payload?.children?.rootId;
        if (rootId) {
            const context = await executeContextProviderDirect(BlocksProvider, {
                query: rootId
            });
            setContext(context);
        }
        const tab = document.querySelector(`li[data-type="tab-header"][data-id="${payload.id}"]`) as HTMLElement;
        if (tab) {
            tab.style.opacity = 'unset';
        }
    };

    // ================================================================
    // Hook API
    // ================================================================

    /**
     * 处理文件列表（核心处理逻辑）
     */
    const processFiles = async (files: File[]) => {
        const { imageFiles, audioFiles, fileAttachments, textFiles } = classifyFiles(files);

        // 添加图片附件 - 转换为 IImageContentPart
        for (const imageFile of imageFiles) {
            try {
                const dataURL = await ImageProcess.toDataURL(imageFile, {
                    maxWidth: 2048,
                    maxHeight: 2048,
                    // quality: 0.9
                });
                addAttachment({
                    type: 'image_url',
                    image_url: {
                        url: dataURL,
                        detail: 'auto'
                    }
                });
            } catch (error) {
                console.error('Failed to process image:', error);
                showMessage(`图片处理失败: ${error.message}`);
            }
        }

        // 添加音频附件 - 转换为 IAudioContentPart
        for (const audioFile of audioFiles) {
            try {
                const { data, format } = await AudioProcess.toBase64(audioFile);
                addAttachment({
                    type: 'input_audio',
                    input_audio: {
                        data,
                        format
                    }
                });
            } catch (error) {
                console.error('Failed to process audio:', error);
                showMessage(`音频处理失败: ${error.message}`);
            }
        }

        // 添加文件附件 - 转换为 IFileContentPart
        for (const file of fileAttachments) {
            try {
                const fileData = await FileProcess.toBase64(file);
                addAttachment({
                    type: 'file',
                    file: {
                        file_data: fileData.data,
                        filename: fileData.filename,
                    }
                });
            } catch (error) {
                console.error('Failed to process file:', error);
                showMessage(`文件处理失败: ${error.message}`);
            }
        }

        // 处理文本文件为 context
        await processTextFiles(textFiles);
    };

    /**
     * 处理 Drop 事件
     */
    const handleDrop = async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!e.dataTransfer?.types.length) return;

        const type = e.dataTransfer.types[0];

        // 思源块拖放
        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
            await handleSiYuanDrop(type);
            return;  // 添加 return，避免继续执行
        }
        // 思源标签页拖放
        if (e.dataTransfer.types.includes(Constants.SIYUAN_DROP_TAB)) {
            await handleSiYuanTabDrop(e.dataTransfer);
            return;  // 添加 return
        }

        // 文件拖放
        if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

        const files = Array.from(e.dataTransfer.files);
        await processFiles(files);
    };

    /**
     * 处理 Paste 事件
     */
    const handlePaste = async (e: ClipboardEvent) => {
        const clipboardData = e.clipboardData;
        const items = clipboardData?.items;
        if (!items) return;

        // 只检测图片和文本
        let hasText = false;
        let hasImage = false;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const type = (item.type || '').toLowerCase();

            if (item.kind === 'string' && type.startsWith('text/')) {
                hasText = true;
            }
            if (item.kind === 'file' && type.startsWith('image/')) {
                hasImage = true;
            }
        }

        const currentModelId = modelId();

        // 文本检查
        if (hasText && !checkSupportsModality(currentModelId, 'text', 'input')) {
            showMessage('当前模型不支持文本输入');
            e.preventDefault();
            return;
        }

        // 图片处理
        if (hasImage) {
            const canPasteImage = checkSupportsModality(currentModelId, 'image', 'input');
            if (!canPasteImage) {
                showMessage('当前模型不支持图片输入');
                return;
            }

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind !== 'file') continue;
                if (!item.type.startsWith('image/')) continue;

                const file = item.getAsFile();
                if (file) {
                    try {
                        const dataURL = await ImageProcess.toDataURL(file, {
                            maxWidth: 2048,
                            maxHeight: 2048,
                            quality: 0.9
                        });
                        addAttachment({
                            type: 'image_url',
                            image_url: {
                                url: dataURL,
                                detail: 'auto'
                            }
                        });
                    } catch (error) {
                        console.error('Failed to process pasted image:', error);
                        showMessage(`图片处理失败: ${error.message}`);
                    }
                }
            }
        }
    };

    /**
     * 处理手动选择的文件（通过文件选择对话框）
     */
    const handleFileSelect = async (files: FileList | File[]) => {
        const fileArray = Array.from(files);
        if (fileArray.length === 0) return;
        await processFiles(fileArray);
    };

    /**
     * 创建用于 UI 的事件处理器
     */
    const createDropHandlers = (className: string) => {
        return {
            onDragOver: (e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                (e.currentTarget as HTMLElement).classList.add(className);
            },
            onDragLeave: (e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                (e.currentTarget as HTMLElement).classList.remove(className);
            },
            onDrop: async (e: DragEvent) => {
                (e.currentTarget as HTMLElement).classList.remove(className);
                await handleDrop(e);
            }
        };
    };

    return {
        handleDrop,
        handlePaste,
        handleFileSelect,
        createDropHandlers,
        getAcceptPattern: () => getAcceptPattern(modelId()),
        checkSupportsFileInput: (id?: string) => checkModelSupportsFileInput(id || modelId())
    };
};
