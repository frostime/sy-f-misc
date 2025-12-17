/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-13
 * @FilePath     : /src/func/gpt/chat/ChatSession/use-attachment-input.ts
 * @LastEditTime : 2025-12-17 17:21:08
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

interface AttachmentInputOptions {
    modelId: Accessor<string>;
    addAttachment: (part: TMessageContentPart) => void;
    setContext: (context: IProvidedContext) => void;
}

interface FileClassification {
    imageFiles: File[];
    audioFiles: File[];
    documentFiles: File[];  // 新增：doc, docx, pdf
    textFiles: File[];
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

export const useAttachmentInputHandler = (options: AttachmentInputOptions) => {
    const { modelId, addAttachment, setContext } = options;

    // ================================================================
    // Helper Function
    // ================================================================

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
     * 分类处理不同类型的文件
     */
    const classifyFiles = (files: File[]): FileClassification => {
        const currentModelId = modelId();
        const imageFiles: File[] = [];
        const audioFiles: File[] = [];
        const documentFiles: File[] = [];  // 新增
        const textFiles: File[] = [];

        for (const file of files) {
            const mimeType = file.type || '';
            const ext = file.name.split('.').pop()?.toLowerCase() || '';

            // 图片文件
            if (mimeType.startsWith('image/')) {
                if (checkSupportsModality(currentModelId, 'image', 'input')) {
                    imageFiles.push(file);
                } else {
                    showMessage(`当前模型不支持图片输入: ${file.name}`);
                }
            }
            // 音频文件
            else if (mimeType.startsWith('audio/')) {
                if (checkSupportsModality(currentModelId, 'audio', 'input')) {
                    audioFiles.push(file);
                } else {
                    showMessage(`当前模型不支持音频输入: ${file.name}`);
                }
            }
            // 文档文件 (新增)
            else if (['pdf', 'doc', 'docx'].includes(ext)) {
                if (file.size > 20 * 1024 * 1024) {  // 20MB 限制
                    showMessage(`文档文件过大 (>20MB): ${file.name}`);
                    continue;
                }
                documentFiles.push(file);
            }
            // 文本文件
            else {
                const supportedTextExts = [
                    'txt', 'md', 'markdown',
                    'py', 'ts', 'js', 'jsx', 'tsx',
                    'json', 'yaml', 'yml', 'toml',
                    'xml', 'html', 'css', 'scss',
                    'c', 'cpp', 'h', 'java', 'go', 'rs'
                ];

                if (!supportedTextExts.includes(ext)) {
                    showMessage(`不支持的文件类型: ${file.name}`);
                    continue;
                }

                if (file.size > 2 * 1024 * 1024) {
                    showMessage(`文本文件过大 (>2MB): ${file.name}`);
                    continue;
                }

                textFiles.push(file);
            }
        }

        return { imageFiles, audioFiles, documentFiles, textFiles };
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
        const { imageFiles, audioFiles, documentFiles, textFiles } = classifyFiles(files);

        // 添加图片附件 - 转换为 IImageContentPart
        for (const imageFile of imageFiles) {
            try {
                const dataURL = await ImageProcess.toDataURL(imageFile, {
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

        // 添加文档附件 - 转换为 IFileContentPart
        for (const docFile of documentFiles) {
            try {
                const fileData = await FileProcess.toBase64(docFile);
                addAttachment({
                    type: 'file',
                    file: {
                        file_data: fileData.data,
                        filename: fileData.filename,
                    }
                });
            } catch (error) {
                console.error('Failed to process document:', error);
                showMessage(`文档处理失败: ${error.message}`);
            }
        }

        // 处理文本文件为 context
        await processTextFiles(textFiles);
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
        createDropHandlers
    };
};
