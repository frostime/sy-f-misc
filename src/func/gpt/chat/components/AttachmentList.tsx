import { Component, For, createMemo, onCleanup } from 'solid-js';
import { simpleDialog } from '@frostime/siyuan-plugin-kits';
import { solidDialog } from '@/libs/dialog';
import styles from './AttachmentList.module.scss';
import { createObjectURLManager, isImageContent, isAudioContent, isFileContent } from '../../chat-utils';

interface Props {
    multiModalAttachments?: TMessageContentPart[];
    contexts?: IProvidedContext[];
    onDelete?: (key: number | string, type: 'attachment' | 'context') => void;
    showDelete?: boolean;
    size?: 'small' | 'medium' | 'large';
}

const AttachmentList: Component<Props> = (props) => {

    const urlManager = createObjectURLManager()

    /**
     * 处理多模态附件，提取显示信息
     */
    const processedAttachments = createMemo(() => {
        if (!props.multiModalAttachments) return [];

        return props.multiModalAttachments.map(part => {
            if (isImageContent(part)) {
                return {
                    type: 'image' as const,
                    url: part.image_url.url,
                    name: 'Image',
                    mimeType: 'image'
                };
            } else if (isAudioContent(part)) {
                return {
                    type: 'audio' as const,
                    data: part.input_audio.data,
                    format: part.input_audio.format,
                    name: `Audio (${part.input_audio.format})`,
                    mimeType: `audio/${part.input_audio.format}`
                };
            } else if (isFileContent(part)) {
                return {
                    type: 'file' as const,
                    filename: part.file.filename || 'Unknown File',
                    data: part.file.file_data,
                    name: part.file.filename || 'File',
                    mimeType: 'application/octet-stream'
                };
            }
            return null;
        }).filter(Boolean);
    });

    onCleanup(() => {
        urlManager.revokeAll();
    });

    const showFullImage = (url: string) => {
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        simpleDialog({
            title: '图片预览',
            ele: img,
            width: '800px',
            maxHeight: '80%',
        });
    };

    const getFileIcon = (mimeType: string) => {
        if (mimeType.startsWith('audio/')) return 'iconRecord';
        if (mimeType.startsWith('video/')) return 'iconVideo';
        return 'iconFile';
    };

    const showContextContent = (context: IProvidedContext) => {
        solidDialog({
            title: context.displayTitle,
            loader: () => {
                let typo: HTMLDivElement;
                const expandAll = () => {
                    const details = typo.querySelectorAll('details');
                    details.forEach(detail => detail.setAttribute('open', ''));
                };

                const collapseAll = () => {
                    const details = typo.querySelectorAll('details');
                    details.forEach(detail => detail.removeAttribute('open'));
                };

                const wordCount = context.contextItems.reduce((acc, item) => acc + item.content.length, 0);

                return (
                    <div
                        class="b3-typography"
                        style="flex: 1; padding: 10px 16px; font-size: 16px !important;"
                        ref={typo}
                    >
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h2>{context.name} | {context.displayTitle} | 共{wordCount}个字符</h2>
                            <div>
                                <button class="b3-button" onClick={expandAll}>展开全部</button>
                                <button class="b3-button" style="margin-left: 8px;" onClick={collapseAll}>折叠全部</button>
                            </div>
                        </div>
                        <p>{context.description}</p>
                        <hr />
                        <ul>
                            {context.contextItems.map((item) => (
                                <details>
                                    <summary>
                                        <strong>{item.name} | {item.content.length}字符</strong>
                                    </summary>
                                    <p innerHTML={item.description}></p>
                                    <pre style={{
                                        "white-space": "pre-wrap",
                                    }}>{item.content}</pre>
                                </details>
                            ))}
                        </ul>
                    </div>
                );
            },
            width: '1000px',
            maxHeight: '80%',
        });
    };

    const sizeClass = () => {
        switch (props.size) {
            case 'small': return styles.small;
            case 'large': return styles.large;
            default: return styles.medium;
        }
    };

    return (
        <div class={styles.attachmentList}>
            <For each={processedAttachments()}>
                {(item, index) => (
                    <div class={`${styles.attachmentItem} ${sizeClass()}`}>
                        {item.type === 'image' ? (
                            <img
                                src={item.url}
                                alt={item.name}
                                onclick={() => showFullImage(item.url)}
                            />
                        ) : item.type === 'audio' ? (
                            <div class={styles.fileAttachment}>
                                <svg class="b3-list-item__graphic"><use href="#iconRecord" /></svg>
                                <span>{item.name}</span>
                            </div>
                        ) : item.type === 'file' ? (
                            <div class={styles.fileAttachment}>
                                <svg class="b3-list-item__graphic"><use href="#iconFile" /></svg>
                                <span>{item.filename}</span>
                            </div>
                        ) : null}
                        {props.showDelete && (
                            <button
                                class="b3-button b3-button--text"
                                onclick={() => props.onDelete?.(index(), 'attachment')}
                            >
                                <svg><use href="#iconTrashcan" /></svg>
                            </button>
                        )}
                    </div>
                )}
            </For>
            <For each={props.contexts}>
                {(context, index) => (
                    <div
                        class={`${styles.attachmentItem} ${sizeClass()} ${styles.contextItem}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            showContextContent(context);
                        }}
                    >
                        <div class={styles.contextTitle}>
                            {context.displayTitle}
                        </div>
                        <div class={styles.contextDescription}>
                            {context.contextItems.map(item => item.name).join('\n')}
                        </div>
                        {props.showDelete && (
                            <button
                                class="b3-button b3-button--text"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    props.onDelete?.(context.id, 'context');
                                }}
                            >
                                <svg><use href="#iconTrashcan" /></svg>
                            </button>
                        )}
                    </div>
                )}
            </For>
        </div>
    );
};

export default AttachmentList;