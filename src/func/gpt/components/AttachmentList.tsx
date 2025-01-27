import { Component, For, createMemo, Show } from 'solid-js';
import { simpleDialog } from '@frostime/siyuan-plugin-kits';
import styles from './AttachmentList.module.scss';
import { solidDialog } from '@/libs/dialog';

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
            loader: () => (
                <div
                    class="b3-typography"
                    style="flex: 1; padding: 10px 16px; font-size: 16px !important;"
                >
                    <h2 >{context.name} | {context.displayTitle}</h2>
                    <p >{context.description}</p>
                    <hr />
                    <ul >
                        {context.contextItems.map((item) => (
                            <li >
                                <strong >{item.name}</strong>
                                <p >{item.description}</p>
                                <pre style={{
                                    "white-space": "pre-line",
                                }}>{item.content}</pre>
                            </li>
                        ))}
                    </ul>
                </div>
            ),
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