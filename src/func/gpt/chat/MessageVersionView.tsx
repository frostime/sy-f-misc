import { Component, createMemo, createSignal, Show } from 'solid-js';
import { inputDialog } from "@frostime/siyuan-plugin-kits";
import { createSignalRef } from '@frostime/solid-signal-ref';

import Markdown from '@/libs/components/Elements/Markdown';
import { ButtonInput } from '@/libs/components/Elements';

import { adaptIMessageContent, mergeMultiVesion } from '@gpt/data-utils';
import { UIConfig } from '@gpt/setting/store';

import styles from './MessageItem.module.scss';
import { type useSession } from './ChatSession.helper';
import { showMessage } from 'siyuan';

const MessageVersionView: Component<{
    session: ReturnType<typeof useSession>;
    messageItemId: string;
    versions: Record<string, any>;
    currentVersion: string;
    onClose: () => void;
}> = (props) => {

    interface VersionItem {
        version: string;
        selected: boolean;
        ref: IChatSessionMsgItem['versions'][string]
    }

    const fontSize = createSignalRef(UIConfig().inputFontsize);

    const msgItem = createMemo(() => {
        const idx = props.session.messages().findIndex((item) => item.id === props.messageItemId);
        if (idx === -1) return null;
        return props.session.messages()[idx];
    });

    const versionContent = (version: string) => {
        let item = msgItem();
        if (!item) return null;
        const content = item.versions[version];
        if (!content) return null;
        const { text } = adaptIMessageContent(content.content);
        return {
            text,
            reasoning: content.reasoning_content
        };
    }

    const [versionItems, setVersionItems] = createSignal<VersionItem[]>(
        Object.keys(props.versions).map((version) => ({
            version,
            selected: false,
            ref: props.versions[version]
        }))
    );

    const previewVersion = createSignalRef<string>(props.currentVersion);
    const previewContent = createMemo(() => (versionContent(previewVersion())));

    const toggleSelect = (version: string) => {
        setVersionItems((prev) =>
            prev.map((item) =>
                item.version === version ? { ...item, selected: !item.selected } : item
            )
        );
    };

    const deleteSelectedVersions = () => {
        const selectedVersions = versionItems()
            .filter((item) => item.selected)
            .map((item) => item.version);

        selectedVersions.forEach((version) => {
            props.session.delMsgItemVersion(props.messageItemId, version);
        });

        // 更新版本列表
        setVersionItems((prev) => prev.filter((item) => !item.selected));
    };

    const ListItems = () => (
        <div class={styles.historyList} style={{
            width: 'auto',
            "min-width": '400px',
            "overflow-y": 'auto'
        }}>
            {versionItems().map((item) => (
                <div
                    class={styles.historyItem} style={{
                        border: '2px solid transparent',
                        'border-color': previewVersion() === item.version ? 'var(--b3-theme-primary)' : 'transparent'
                    }}
                >
                    <div class={styles.historyTitleLine}>
                        <div class={styles.historyTitle} style={{
                            display: 'flex',
                            "justify-content": 'space-between'
                        }}>
                            <span>{`v${Object.keys(props.versions).indexOf(item.version) + 1}`}@{item.version}</span>
                            {item.ref.author}
                        </div>

                        <div style={{ display: 'flex', "align-items": 'center', gap: '5px' }}>
                            <input
                                class="b3-switch"
                                type="checkbox"
                                checked={item.selected}
                                onchange={[toggleSelect, item.version]}
                                disabled={item.version === props.currentVersion}
                            />
                            <button
                                class="b3-button b3-button--text"
                                onClick={() => {
                                    props.session.delMsgItemVersion(props.messageItemId, item.version, false);
                                    setVersionItems((prev) => {
                                        prev = prev.filter((i) => i.version !== item.version);
                                        return prev;
                                    });
                                }}
                                disabled={item.version === props.currentVersion}
                            >
                                <svg><use href="#iconTrashcan"></use></svg>
                            </button>
                            <button
                                class="b3-button b3-button--text"
                                onclick={() => {
                                    navigator.clipboard.writeText(versionContent(item.version)?.text);
                                    showMessage('已复制到剪贴板');
                                }}
                            >
                                <svg><use href="#iconCopy"></use></svg>
                            </button>
                            <button
                                class="b3-button b3-button--text"
                                onclick={() => {
                                    props.session.switchMsgItemVersion(props.messageItemId, item.version);
                                    props.onClose();
                                }}
                                disabled={item.version === props.currentVersion}
                            >
                                <svg><use href="#iconSelect"></use></svg>
                            </button>
                        </div>
                    </div>
                    <div
                        class={styles.historyContent} style={{
                            'font-size': '15px',
                            'line-height': '20px',
                            'white-space': 'normal'
                        }} onClick={(e) => {
                            e.stopPropagation();
                            previewVersion(item.version);
                        }}
                    >
                        <Show when={item.ref.reasoning_content}>
                            <b>包含推理过程</b>
                        </Show>
                        {versionContent(item.version)?.text}
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div class="fn__flex-column fn__flex-1" style="gap: 8px">
            <div class="fn__flex" style={{
                'align-items': 'center',
                "justify-content": 'flex-end',
                gap: '3px',
                padding: '4px 12px'
            }}>
                <div style={{
                    display: 'flex',
                    "align-items": 'center'
                }}>
                    <ButtonInput classText={true} onClick={() => { fontSize.value += 1; }} >
                        +
                    </ButtonInput>
                    <span class='b3-label__text'>/</span>
                    <ButtonInput classText={true} onClick={() => { fontSize.value -= 1; }} >
                        -
                    </ButtonInput>
                </div>
                <button
                    class="b3-button b3-button--outline"
                    onClick={() => {
                        const mergedContent = mergeMultiVesion(msgItem());

                        inputDialog({
                            title: '合并的多版本消息',
                            defaultText: mergedContent,
                            type: 'textarea',
                            width: '1000px',
                            height: '640px'
                        });
                    }}
                >
                    合并显示
                </button>
                <button class="b3-button b3-button--text" onClick={deleteSelectedVersions} disabled={!versionItems().some((item) => item.selected)}>
                    Delete
                </button>
            </div>
            <div style={{
                display: 'flex',
                gap: '10px',
                "overflow-y": 'hidden'
            }}>
                <ListItems />
                <div style={{
                    flex: 2,
                    'overflow-y': 'auto'
                }}>
                    <Show when={previewContent()?.reasoning}>
                        <details class={styles.reasoningDetails}>
                            <summary>推理过程</summary>
                            <Markdown markdown={previewContent()?.reasoning} fontSize={fontSize() + 'px'} />
                            <br />
                        </details>
                    </Show>
                    <Markdown markdown={previewContent()?.text} fontSize={fontSize() + 'px'} />
                </div>
            </div>
        </div>
    );
};

export default MessageVersionView;
