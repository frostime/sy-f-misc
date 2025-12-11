import { Component, For, createMemo } from 'solid-js';
import { simpleDialog } from '@frostime/siyuan-plugin-kits';
import { solidDialog } from '@/libs/dialog';
import styles from './AttachmentList.module.scss';

type ImageSource = Blob | string;

interface Props {
    images?: ImageSource[];
    contexts?: IProvidedContext[];
    onDelete?: (key: number | string, type: 'image' | 'context') => void;
    showDelete?: boolean;
    size?: 'small' | 'medium' | 'large';
}

const AttachmentList: Component<Props> = (props) => {
    const processedImages = createMemo(() => {
        if (!props.images) return [];
        // 可能存在内存泄漏
        return props.images.map(img => {
            if (img instanceof Blob) {
                return URL.createObjectURL(img);
            } else if (img.startsWith('data:image')) {
                return img;
            } else {
                // 普通 URL
                return img;
            }
        });
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
                {(url, index) => (
                    <div class={`${styles.attachmentItem} ${sizeClass()}`}>
                        <img
                            src={url}
                            alt="Attachment"
                            onclick={() => showFullImage(url)}
                        />
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