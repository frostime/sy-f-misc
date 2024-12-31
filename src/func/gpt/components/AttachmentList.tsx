import { Component, For, createMemo } from 'solid-js';
import { simpleDialog } from '@frostime/siyuan-plugin-kits';
import styles from './AttachmentList.module.scss';

type ImageSource = Blob | string;

interface Props {
    images?: ImageSource[];
    onDelete?: (index: number) => void;
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
            width: '800px'
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
                                onclick={() => props.onDelete?.(index())}
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