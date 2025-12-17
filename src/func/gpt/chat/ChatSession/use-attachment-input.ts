/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-13
 * @FilePath     : /src/func/gpt/chat/ChatSession/attachment-input.ts
 * @LastEditTime : 2025-12-13 22:58:30
 * @Description  : 统一处理文件输入的 Hook (paste/drag/drop)
 */

import { Accessor } from 'solid-js';
import { showMessage, Constants } from 'siyuan';
import { checkSupportsModality } from '@/func/gpt/model/store';
import { executeContextProviderDirect } from '@gpt/context-provider';
import SelectedTextProvider from '@gpt/context-provider/SelectedTextProvider';
import BlocksProvider from '@gpt/context-provider/BlocksProvider';
import { truncateContent } from '@gpt/tools/utils';

interface AttachmentInputOptions {
    modelId: Accessor<string>;
    addAttachment: (file: Blob) => void;
    setContext: (context: IProvidedContext) => void;
}

interface FileClassification {
    imageFiles: File[];
    audioFiles: File[];
    textFiles: File[];
}

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
        const textFiles: File[] = [];

        for (const file of files) {
            const mimeType = file.type || '';

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
            // 文本文件
            else {
                const ext = file.name.split('.').pop()?.toLowerCase();
                const supportedTextExts = ['txt', 'md', 'py', 'ts', 'js', 'json', 'yaml', 'toml', 'xml', 'html'];

                if (file.size > 2 * 1024 * 1024) {
                    showMessage(`文件过大 (>2MB): ${file.name}`);
                    continue;
                }

                if (supportedTextExts.includes(ext || '')) {
                    textFiles.push(file);
                }
            }
        }

        return { imageFiles, audioFiles, textFiles };
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
                    id: `file-${Date.now()}-${file.name}`,
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
     * 处理普通文件列表
     */
    const handleFiles = async (files: File[]) => {
        const { imageFiles, audioFiles, textFiles } = classifyFiles(files);

        // 添加图片附件
        for (const imageFile of imageFiles) {
            addAttachment(imageFile);
        }

        // 添加音频附件
        for (const audioFile of audioFiles) {
            addAttachment(audioFile);
        }

        // 处理文本文件为 context
        await processTextFiles(textFiles);
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
        }
        // 思源标签页拖放
        else if (e.dataTransfer.types.includes(Constants.SIYUAN_DROP_TAB)) {
            await handleSiYuanTabDrop(e.dataTransfer);
        }
        // 文件拖放
        else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            await handleFiles(files);
        }
    };

    /**
     * 处理 Paste 事件
     */
    const handlePaste = async (e: ClipboardEvent) => {
        const clipboardData = e.clipboardData;
        const items = clipboardData?.items;
        if (!items) return;

        // 检测剪贴板项目类型
        let hasText = false;
        let hasImage = false;
        let hasFile = false; // 非图片文件

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const type = (item.type || '').toLowerCase();

            if (item.kind === 'string') {
                if (type.startsWith('text/')) {
                    hasText = true;
                }
                continue;
            }

            if (item.kind === 'file') {
                if (type.startsWith('image/')) {
                    hasImage = true;
                } else if (type.startsWith('audio/')) {
                    hasFile = true;
                } else {
                    hasFile = true;
                }
            }
        }

        const currentModelId = modelId();

        // 文本粘贴：当模型不支持文本输入时阻止
        if (hasText && !checkSupportsModality(currentModelId, 'text', 'input')) {
            showMessage('当前模型不支持文本输入');
            e.preventDefault();
            return;
        }

        // 图片粘贴：仅当剪贴板包含图片时警告/处理
        const canPasteImage = !hasImage || checkSupportsModality(currentModelId, 'image', 'input');
        if (hasImage && !canPasteImage) {
            showMessage('当前模型不支持图片输入');
        }

        // 文件粘贴：检测非图片文件并检查模态
        const canPasteFile = !hasFile || checkSupportsModality(currentModelId, 'audio', 'input');
        if (hasFile && !canPasteFile) {
            showMessage('当前模型不支持文件输入');
        }

        // 添加图片附件
        if (hasImage && canPasteImage) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const type = (item.type || '').toLowerCase();
                if (item.kind !== 'file') continue;
                if (!type.startsWith('image/')) continue;
                const file = item.getAsFile();
                if (file) {
                    addAttachment(file);
                }
            }
        }

        // 添加音频附件
        if (hasFile && canPasteFile) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const type = (item.type || '').toLowerCase();
                if (item.kind !== 'file') continue;
                if (!type.startsWith('audio/')) continue;
                const file = item.getAsFile();
                if (file) {
                    addAttachment(file);
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
