import { Component, For, createMemo, onCleanup } from 'solid-js';
import { simpleDialog } from '@frostime/siyuan-plugin-kits';
import { solidDialog } from '@/libs/dialog';
import styles from './AttachmentList.module.scss';
import { createObjectURLManager } from '../../chat-utils';

type ImageSource = Blob | string;

interface Props {
    images?: ImageSource[];
    contexts?: IProvidedContext[];
    onDelete?: (key: number | string, type: 'image' | 'context') => void;
    showDelete?: boolean;
    size?: 'small' | 'medium' | 'large';
}

const AttachmentList: Component<Props> = (props) => {

    const urlManager = createObjectURLManager()

    const processedImages = createMemo(() => {
        // urlManager.revokeAll();
        if (!props.images) return [];
        return props.images.map(img => {
            if (img instanceof Blob) {
                return {
                    url: urlManager.create(img),
                    type: img.type || '',
                    name: img instanceof File ? img.name : undefined
                };
            } else {
                return {
                    url: img,
                    type: 'image',
                    name: undefined
                };
            }
        });
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
            <For each={processedImages()}>
                {(item, index) => (
                    <div class={`${styles.attachmentItem} ${sizeClass()}`}>
                        {item.type.startsWith('image/') || item.type === 'image' ? (
                            <img
                                src={item.url}
                                alt={item.name || "Attachment"}
                                onclick={() => showFullImage(item.url)}
                            />
                        ) : (
                            <div
                                class={styles.fileAttachment}
                                onclick={() => {
                                    // 对于非图片文件，可以提供下载或预览
                                    const a = document.createElement('a');
                                    a.href = item.url;
                                    a.download = item.name || 'attachment';
                                    a.click();
                                }}
                            >
                                <svg class="b3-list-item__graphic"><use href={`#${getFileIcon(item.type)}`} /></svg>
                                <span>{item.name || '未命名文件'}</span>
                            </div>
                        )}
                        {props.showDelete && (
                            <button
                                class="b3-button b3-button--text"
                                onclick={() => props.onDelete?.(index(), 'image')}
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