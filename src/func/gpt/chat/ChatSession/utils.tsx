import {
    onMount, onCleanup,
} from 'solid-js';
import { useSignalRef } from '@frostime/solid-signal-ref';
import { Protyle } from 'siyuan';
import { getMarkdown, thisPlugin, useDocumentWithAttr } from '@frostime/siyuan-plugin-kits';
import * as syDoc from '@gpt/persistence/sy-doc';
import styles from './ChatSession.module.scss';
import { solidDialog } from '@/libs/dialog';


export const useSiYuanEditor = (props: {
    id: string;
    input: ReturnType<typeof useSignalRef<string>>;
    fontSize?: string;
    title?: () => string;
    useTextarea: () => HTMLTextAreaElement;
    submit: () => void;
}) => {
    let document: Awaited<ReturnType<typeof useDocumentWithAttr>> = null;
    const prepareDocument = async () => {
        if (document) return;
        const root = await syDoc.ensureRootDocument('GPT 导出文档');
        let configs = {};
        if (root) {
            configs = {
                notebook: root.box,
                dir: root.hpath,
            }
        }
        const textarea = props.useTextarea();
        document = await useDocumentWithAttr({
            name: 'custom-gpt-input-dialog',
            value: props.id,
            createOptions: {
                content: textarea?.value ?? props.input(),
                title: props.title ? 'Input-' + props.title() : `gpt-input-${props.id}`,
                ...configs
            }
        });
        // document.setAttrs({
        //     'custom-hidden': 'true'
        // });
    }
    const getText = async () => {
        const content = await getMarkdown(document.id);
        let lines = content.trim().split('\n');
        if (lines.length === 0) return '';

        // 去除 YAML frontmatter
        if (lines[0] === '---') {
            const endIndex = lines.slice(1).indexOf('---') + 1;
            if (endIndex > 0) {
                lines = lines.slice(endIndex + 1);
            }
        }

        lines = lines.join('\n').trim().split('\n');

        // 去除开头的标题
        if (lines[0].startsWith('# ')) {
            lines.shift();
        }

        return lines.join('\n').trim();
    }

    const InputDialog = (p: { close: () => void }) => {
        let ref: HTMLDivElement = null;
        onMount(() => {
            new Protyle(
                thisPlugin().app,
                ref,
                {
                    rootId: document.id,
                    blockId: document.id,
                    render: {
                        background: false,
                        title: false,
                        breadcrumb: false,
                    }
                }
            );

            if (props.fontSize) {
                const wysiwygElement: HTMLElement = ref.querySelector('.protyle-wysiwyg');
                setTimeout(() => {
                    wysiwygElement.style.fontSize = `var(--input-font-size) !important;`;
                }, 250);
            }
        });
        onCleanup(() => {
            if (!document) return;
            document?.setContent('');
        });
        return (
            <div style={{
                display: 'flex',
                "flex-direction": 'column',
                flex: 1,
                background: 'var(--b3-theme-background)',
                margin: '1em',
                border: '1px solid var(--b3-border-color)',
            }}>
                <div style={{
                    display: 'flex',
                    "justify-content": 'space-between',
                    margin: '10px 12px',
                    gap: '10px',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--b3-theme-background)',
                    'z-index': 1
                }}>
                    <div style={{
                        flex: 1,
                    }} />
                    <button class="b3-button b3-button--outline" onclick={async () => {
                        const content = await getText();
                        // const textarea = props.useTextarea();
                        // textarea.value = content;
                        props.input(content);
                    }}>
                        填充
                    </button>
                    <button class="b3-button" onclick={async () => {
                        const content = await getText();
                        props.input(content);
                        // const textarea = props.useTextarea();
                        // textarea.value = content;
                        if (props.title) {
                            document.setTitle(props.title());
                        }
                        document.setContent('');
                        props.submit();
                        p.close();
                    }}>
                        Submit
                    </button>
                </div>
                <div class={styles['protyle-container']} ref={ref} style={{
                    flex: 1,
                    '--input-font-size': props.fontSize
                }} />
            </div>
        )
    }

    const showDialog = async () => {
        if (!document) {
            await prepareDocument();
        } else {
            await document.setContent(props.input().trim());
        }
        const { close } = solidDialog({
            title: '高级编辑',
            loader: () => (
                <InputDialog close={() => close()} />
            ),
            width: '720px',
            maxWidth: '80%',
            maxHeight: '80%',
        });
    }

    return {
        showDialog,
        cleanUp: async () => {
            if (!document) return;
            await document.delete();
            document = null;
        }
    }
}
