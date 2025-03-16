import { Component, createEffect, createMemo, createSignal, on, Show } from 'solid-js';
import { formatDateTime, getLute, html2ele, inputDialog, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { confirm, Menu } from "siyuan";

import styles from './MessageItem.module.scss';
import AttachmentList from './AttachmentList';
import { addScript, addStyle, convertMathFormulas } from '../utils';
import { adaptIMessageContent } from '../data-utils';
import { Constants, showMessage } from 'siyuan';
import { defaultConfig, UIConfig } from '../setting/store';
import { type useSession, useSimpleContext } from './UseSession';
import { solidDialog } from '@/libs/dialog';
import Markdown from '@/libs/components/Elements/Markdown';
import { createSignalRef } from '@frostime/solid-signal-ref';
import { ButtonInput } from '@/libs/components/Elements';


const useCodeToolbar = (language: string, code: string) => {
    const RUN_BUTTON = `
    <button
        class="${styles.toolbarButton} b3-button b3-button--text"
        data-role="run"
        style="padding: 0;"
        title="Run"
    >
        <svg><use href="#iconPlay" /></svg>
    </button>
    `;

    let html = `
    <div class="${styles['code-toolbar']}">
        ${language.toLocaleLowerCase() === 'html' ? RUN_BUTTON : ''}
        <div class="fn__flex-1"></div>
        <span class="b3-label__text" style="font-family: var(--b3-font-family-code); margin: 0px;">
            ${language}
        </span>
        <button
            class="${styles.toolbarButton} b3-button b3-button--text"
            data-role="copy"
            style="padding: 0;"
            title="复制"
        >
            <svg><use href="#iconCopy" /></svg>
        </button>
    </div>
    `;
    let ele = html2ele(html);
    (ele.querySelector('button[data-role="copy"]') as HTMLButtonElement).onclick = () => {
        navigator.clipboard.writeText(code);
    }
    let btnRun = ele.querySelector('button[data-role="run"]') as HTMLButtonElement;
    if (btnRun) {
        btnRun.onclick = () => {
            let iframe = document.createElement('iframe');
            iframe.id = 'run-iframe';
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.srcdoc = code;
            const container = document.createElement('div');
            container.style.display = 'contents';
            container.appendChild(iframe);
            simpleDialog({
                title: '运行结果',
                ele: container,
                width: '1000px',
                height: '700px'
            });
        }
    }

    return ele;
}

const initHljs = async () => {
    if (window.hljs) return;

    //https://github.com/siyuan-note/siyuan/blob/master/app/src/util/assets.ts#L309
    const setCodeTheme = (cdn = Constants.PROTYLE_CDN) => {
        const protyleHljsStyle = document.getElementById("protyleHljsStyle") as HTMLLinkElement;
        let css;
        if (window.siyuan.config.appearance.mode === 0) {
            css = window.siyuan.config.appearance.codeBlockThemeLight;
            if (!Constants.SIYUAN_CONFIG_APPEARANCE_LIGHT_CODE.includes(css)) {
                css = "default";
            }
        } else {
            css = window.siyuan.config.appearance.codeBlockThemeDark;
            if (!Constants.SIYUAN_CONFIG_APPEARANCE_DARK_CODE.includes(css)) {
                css = "github-dark";
            }
        }
        const href = `${cdn}/js/highlight.js/styles/${css}.min.css`;
        if (!protyleHljsStyle) {
            addStyle(href, "protyleHljsStyle");
        } else if (!protyleHljsStyle.href.includes(href)) {
            protyleHljsStyle.remove();
            addStyle(href, "protyleHljsStyle");
        }
    };

    const cdn = Constants.PROTYLE_CDN;
    setCodeTheme(cdn);
    await addScript(`${cdn}/js/highlight.js/highlight.min.js`, "protyleHljsScript");
    await addScript(`${cdn}/js/highlight.js/third-languages.js`, "protyleHljsThirdScript");
    return window.hljs !== undefined && window.hljs !== null;
}

const initKatex = async () => {
    if (window.katex) return;
    // https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/render/mathRender.ts
    const cdn = Constants.PROTYLE_CDN;
    addStyle(`${cdn}/js/katex/katex.min.css`, "protyleKatexStyle");
    await addScript(`${cdn}/js/katex/katex.min.js`, "protyleKatexScript");
    return window.katex !== undefined && window.katex !== null;
}

const renderCodeblock = (ele: HTMLElement) => {
    const language = ele.className.replace('language-', '').trim();

    let codeContent = ele.textContent;
    window.hljs.highlightElement(ele);

    //Create boolbar
    let btn = useCodeToolbar(language || 'text', codeContent);
    const pre = ele.parentElement;


    // Create scroll container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = styles['pre-scroll-container'];
    // Move code into scroll container
    scrollContainer.appendChild(ele);

    // Add elements to pre in correct order
    pre.appendChild(btn);
    pre.appendChild(scrollContainer);

    pre.prepend(btn);
    if (['markdown', 'md', 'text', 'plaintext', 'tex', 'latex', '', 'undefined'].includes(language)) {
        ele.style.whiteSpace = 'pre-wrap';
    }
    // pre.style.marginTop = '0';
    Object.assign(pre.style, {
        'margin-top': 0,
        'white-space': 'pre'
    })
}

const renderMathBlock = (element: HTMLElement) => {
    try {
        const formula = element.textContent || '';
        if (!formula.trim()) {
            return;
        }

        const isBlock = element.tagName.toUpperCase() === 'DIV';

        // 使用 KaTeX 渲染公式
        const html = window.katex.renderToString(formula, {
            throwOnError: false, // 发生错误时不抛出异常
            displayMode: isBlock,   // 使用显示模式（居中显示）
            strict: (errorCode) => errorCode === "unicodeTextInMathMode" ? "ignore" : "warn",
            trust: true
        });

        // 清空原始内容并插入渲染后的内容
        element.innerHTML = html;
        if (isBlock) {
            element.classList.add(styles['katex-center-display']);
        }

    } catch (error) {
        console.error('Error rendering math formula:', error);
        // 可以在这里添加错误处理逻辑，比如显示错误提示
        element.innerHTML = `<span style="color: red;">Error rendering formula: ${error.message}</span>`;
    }
}



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

    // const lute = getLute();

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

const MessageItem: Component<{
    messageItem: IChatSessionMsgItem,
    markdown?: boolean,
    updateIt?: (message: string) => void,
    deleteIt?: () => void,
    rerunIt?: () => void,
    multiSelect?: boolean,
    selected?: boolean,
    onSelect?: (id: string, selected: boolean) => void,
    toggleSeperator?: () => void,
    toggleHidden?: () => void,
    index?: number,
    totalCount?: number
}> = (props) => {

    let lute = getLute();

    let msgRef: HTMLDivElement;

    const { session } = useSimpleContext();

    const renderCode = async () => {
        const codeBlocks = msgRef.querySelectorAll('pre>code');
        if (codeBlocks.length === 0) {
            return;
        }
        if (!window.hljs) {
            await initHljs();
        }
        if (window.hljs) {
            codeBlocks.forEach((ele: HTMLElement) => {
                renderCodeblock(ele);
            });
        }
    }

    const renderMath = async () => {
        let mathElements: HTMLElement[] = Array.from(msgRef.querySelectorAll('.language-math'));

        if (mathElements.length === 0) {
            return;
        }

        if (!window.katex) {
            await initKatex();
        }

        // 遍历所有数学公式元素并渲染
        mathElements.forEach((element) => {
            renderMathBlock(element);
        });
    }

    const runMdRenderer = () => {
        renderCode();
        renderMath();
    }

    // onMount(async () => {
    //     //仅仅只在需要配置调整 Lute 渲染的 markdown 内容时才会执行
    //     if (props.markdown !== true) return;
    //     runMdRenderer();
    // });

    const textContent = createMemo(() => {
        let { text } = adaptIMessageContent(props.messageItem.message.content);
        if (props.messageItem.userPromptSlice) {
            //隐藏 context prompt
            text = text.slice(props.messageItem.userPromptSlice[0], props.messageItem.userPromptSlice[1]);
        }

        if (defaultConfig().convertMathSyntax) {
            text = convertMathFormulas(text);
        }
        return text;
    });

    const imageUrls = createMemo(() => {
        let { images } = adaptIMessageContent(props.messageItem.message.content);
        images = images || [];
        images = images.map(image => {
            if (image.startsWith('data:image')) {
                // 解析 data URL
                const [header, base64data] = image.split(',');
                // 将 base64 转换为二进制数组
                const binaryData = atob(base64data);
                const bytes = new Uint8Array(binaryData.length);
                for (let i = 0; i < binaryData.length; i++) {
                    bytes[i] = binaryData.charCodeAt(i);
                }
                // 从 header 中获取 MIME 类型
                const mimeType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
                // 创建 Blob
                const blob = new Blob([bytes], { type: mimeType });
                return URL.createObjectURL(blob);
            }
            return image;
        });
        return images;
    });

    const messageAsHTML = createMemo(() => {
        let text = textContent();
        if (props.markdown) {
            //@ts-ignore
            let html = lute.Md2HTML(text);
            return html;
        } else {
            return window.Lute.EscapeHTMLStr(text);
        }
    });

    const msgLength = createMemo(() => {
        let { text } = adaptIMessageContent(props.messageItem.message.content);
        return text.length;
    });

    // createEffect(on(textContent, () => {
    //     console.log(`Text changed: ${textContent()}`);
    //     // renderCode();
    //     // renderMath();
    // }));

    // Add effect to monitor message changes
    // createEffect(on(() => props.messageItem.message, () => {
    //     console.log(`Msg changed: ${props.messageItem.message}`);
    //     if (props.markdown !== true) return;
    //     runMdRenderer();
    // }));

    createEffect(on(() => props.messageItem.message.content, () => {
        if (props.markdown !== true) return;
        // console.log(`Msg.content changed: ${props.messageItem.message.content}`);
        runMdRenderer();
    }));

    const VersionHooks = {
        hasMultiVersion: () => {
            return props.messageItem.versions && Object.keys(props.messageItem.versions).length > 1;
        },
        versionKeys: () => {
            if (!VersionHooks.hasMultiVersion()) return [];
            return Object.keys(props.messageItem.versions).map((_, index) => `v${index + 1}`);
        },
        currentVersion: () => {
            let index = 1;
            if (props.messageItem.versions[props.messageItem.currentVersion]) {
                index = Object.keys(props.messageItem.versions).indexOf(props.messageItem.currentVersion) + 1;
            }
            return `v${index}`;
        },
        switchVersionMenu: () => {
            if (!VersionHooks.hasMultiVersion()) return [];
            return Object.keys(props.messageItem.versions).map((version, index) => {
                return {
                    icon: version === props.messageItem.currentVersion ? 'iconCheck' : '',
                    label: `v${index + 1}`,
                    click: (_, event: MouseEvent) => {
                        const target = event.target as HTMLElement;
                        if (target.closest('.b3-menu__action')) {
                            session.delMsgItemVersion(props.messageItem.id, version);
                        } else {
                            session.switchMsgItemVersion(props.messageItem.id, version);
                        }
                    },
                    action: `iconClose`
                }
            });
        },
        switchVersionDialog: () => {
            if (!VersionHooks.hasMultiVersion()) {
                showMessage('当前消息没有多版本');
                return;
            }
            const { dialog } = solidDialog({
                title: '多选版本',
                loader: () => (
                    <MessageVersionView
                        session={session}
                        messageItemId={props.messageItem.id}
                        versions={props.messageItem.versions ?? {}}
                        currentVersion={props.messageItem.currentVersion ?? ''}
                        onClose={() => {
                            dialog.destroy();
                        }}
                    />
                ),
                width: '1600px',
                height: '1000px',
                maxHeight: '85%',
                maxWidth: '90%'
            });
        }
    }

    // #iconAccount
    const IconUser = () => (
        <svg>
            <use href="#iconAccount" />
        </svg>
    );

    const IconAssistant = () => (
        <svg>
            <use href="#iconGithub" />
        </svg>
    );

    const editMessage = () => {
        inputDialog({
            title: '编辑消息',
            defaultText: textContent(),
            confirm: (text) => {
                props.updateIt?.(text);
            },
            'type': 'textarea',
            width: '700px',
            height: '500px'
        });
    }

    const copyMessage = () => {
        try {
            // 强制将焦点设置到文档的 body 元素上
            document.body.focus();
            navigator.clipboard.writeText(textContent());
            showMessage('已复制到剪贴板');
        } catch (error) {
            console.error('剪贴板操作失败:', error);
            showMessage('复制失败，请重试');
        }
    };

    const deleteMessage = () => {
        props.deleteIt?.();
    }

    const createNewBranch = () => {
        const messages = session.messages();
        const currentIndex = messages.findIndex(m => m.id === props.messageItem.id);
        if (currentIndex === -1) return;

        confirm('确认?', '保留以上记录，创建一个新的对话分支', () => {
            const branchMessages = messages.slice(0, currentIndex + 1);
            const newSession = {
                title: session.title() + ' - 新的分支',
                items: branchMessages,
                sysPrompt: session.systemPrompt()
            };
            session.newSession();
            session.applyHistory(newSession);
        });
    };

    const ToolbarButton = (props: {
        icon: string, title?: string, onclick: (e?: MouseEvent) => void
    }) => {
        return (
            <button
                class={`${styles.toolbarButton} b3-button b3-button--text`}
                onclick={(e) => {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    props.onclick(e);
                }}
                title={props.title}
            >
                <svg><use href={`#${props.icon}`} /></svg>
            </button>
        );
    }

    const onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const menu = new Menu("message-item-menu");
        // Add action buttons
        menu.addItem({
            icon: 'iconEdit',
            label: '编辑',
            click: editMessage
        });
        menu.addItem({
            icon: 'iconCopy',
            label: '复制',
            click: copyMessage
        });
        menu.addItem({
            icon: 'iconCut',
            label: '新的分支',
            click: createNewBranch
        });
        menu.addItem({
            icon: 'iconLine',
            label: '下方添加分隔',
            click: () => props.toggleSeperator?.()
        });
        menu.addItem({
            icon: 'iconAdd',
            label: '下方添加空白消息',
            click: () => {
                const timestamp = new Date().getTime();
                const newMessage: IChatSessionMsgItem = {
                    type: 'message',
                    id: window.Lute.NewNodeID(),
                    timestamp: timestamp,
                    author: 'user',
                    message: {
                        role: 'user',
                        content: ''
                    },
                    currentVersion: timestamp.toString(),
                    versions: {}
                };
                session.messages.update((oldList: IChatSessionMsgItem[]) => {
                    const index = oldList.findIndex(item => item.id === props.messageItem.id);
                    if (index === -1) return oldList;
                    const newList = [...oldList];
                    newList.splice(index + 1, 0, newMessage);
                    return newList;
                });
            }
        });
        menu.addItem({
            icon: props.messageItem.hidden ? 'iconEyeoff' : 'iconEye',
            label: props.messageItem.hidden ? '在上下文中显示' : '在上下文中隐藏',
            click: () => props.toggleHidden?.()
        });
        menu.addItem({
            icon: 'iconTrashcan',
            label: '删除',
            click: () => {
                confirm('确认?', '是否删除此消息', () => {
                    deleteMessage();
                });
            }
        });
        menu.addItem({
            icon: 'iconRefresh',
            label: '重新运行',
            click: () => {
                confirm('确认?', '是否重新运行此消息', () => {
                    props.rerunIt?.();
                });
            }
        });
        if (VersionHooks.hasMultiVersion()) {
            menu.addItem({
                icon: 'iconHistory',
                label: '消息多版本',
                click: VersionHooks.switchVersionDialog
            });
        }

        menu.addSeparator();
        menu.addItem({
            icon: 'iconPreview',
            label: '查看原始 Prompt',
            click: () => {
                const { text } = adaptIMessageContent(props.messageItem.message.content);
                inputDialog({
                    title: '原始 Prompt',
                    defaultText: text,
                    type: 'textarea',
                    width: '700px',
                    height: '500px'
                });
            }
        })

        const submenus = [];

        submenus.push({
            label: `作者: ${props.messageItem.author}`,
            type: 'readonly'
        });
        submenus.push({
            label: `消息长度: ${msgLength()}`,
            type: 'readonly'
        });
        if (props.messageItem.attachedItems) {
            submenus.push({
                label: `上下文条目: ${props.messageItem.attachedItems}`,
                type: 'readonly'
            });
        }
        if (props.messageItem.attachedChars) {
            submenus.push({
                label: `上下文字数: ${props.messageItem.attachedChars}`,
                type: 'readonly'
            });
        }
        if (props.messageItem.token) {
            submenus.push({
                label: `Token: ${props.messageItem.token}`,
                type: 'readonly'
            });
        }

        menu.addItem({
            icon: 'iconInfo',
            type: 'submenu',
            label: '相关信息',
            submenu: submenus
        });

        menu.open({
            x: e.clientX,
            y: e.clientY
        });
    }

    const VersionIndicator = () => {
        const showVersionMenu = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();

            const menu = new Menu("version-menu");

            // Add version switch items
            VersionHooks.switchVersionMenu().forEach((item) => {
                menu.addItem(item);
            });

            // Add view all versions option
            menu.addSeparator();
            menu.addItem({
                icon: 'iconList',
                label: '查看所有版本',
                click: VersionHooks.switchVersionDialog
            });

            const target = e.target as HTMLElement;
            const rect = target.getBoundingClientRect();
            menu.open({
                x: rect.left,
                y: rect.bottom
            });
        };

        return (
            <Show when={VersionHooks.hasMultiVersion()}>
                <div
                    class={styles.versionIndicator}
                    onClick={showVersionMenu}
                    title="消息版本"
                >
                    <svg><use href="#iconHistory" /></svg>
                    {VersionHooks.currentVersion()}
                </div>
            </Show>
        );
    };

    return (
        <div class={styles.messageItem} data-role={props.messageItem.message.role}
            tabindex={props.index ?? -1}
            onKeyDown={(e: KeyboardEvent & { currentTarget: HTMLElement }) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();

                    if (props.index === undefined || props.totalCount === undefined) return;

                    const direction = e.key === 'ArrowUp' ? -1 : 1;
                    const targetIndex = props.index + direction;

                    if (targetIndex >= 0 && targetIndex < props.totalCount) {
                        const targetElement = document.querySelector(`[data-session-id="${session.sessionId()}"] .${styles.messageItem}[tabindex="${targetIndex}"]`) as HTMLElement;
                        if (targetElement) {
                            targetElement.focus();
                            targetElement.scrollIntoView({ behavior: 'auto', block: 'start' });
                        }
                    }
                }
            }}
        >
            <Show when={props.multiSelect}>
                <div class={styles.checkbox} onclick={(e) => {
                    e.stopPropagation();
                    props.onSelect?.(props.messageItem.id, !props.selected);
                }}>
                    <svg>
                        <use href={props.selected ? "#iconCheck" : "#iconUncheck"} />
                    </svg>
                </div>
            </Show>
            <VersionIndicator />
            {props.messageItem.message.role === 'user' ? (
                <div class={styles.icon}><IconUser /></div>
            ) : (
                <div class={styles.icon}><IconAssistant /></div>
            )}
            <div class={styles.messageContainer}>
                <Show when={props.messageItem.message.reasoning_content}>
                    <details class={styles.reasoningDetails}>
                        <summary>推理过程</summary>
                        <div
                            class={`${styles.reasoningContent} b3-typography`}
                            innerHTML={
                                // @ts-ignore
                                lute.Md2HTML(props.messageItem.message.reasoning_content)
                            }
                        />
                    </details>
                </Show>
                <div
                    oncontextmenu={onContextMenu}
                    classList={{
                        [styles.message]: true,
                        [styles[props.messageItem.message.role]]: true,
                        'b3-typography': true,
                        [styles.hidden]: props.messageItem.hidden
                    }}
                    style={{
                        'white-space': props.markdown ? '' : 'pre-wrap',
                    }}
                    innerHTML={messageAsHTML()}
                    ref={msgRef}
                />
                <Show when={imageUrls().length > 0 || props.messageItem.context?.length > 0}>
                    <AttachmentList
                        images={imageUrls()}
                        contexts={props.messageItem.context}
                        size="small"
                    />
                </Show>
                <div class={styles.toolbar}>
                    {/* <span data-label="index">
                        {props.index}
                    </span>
                    <span>|</span> */}
                    <span data-label="timestamp">
                        {formatDateTime(null, new Date(props.messageItem.timestamp))}
                    </span>
                    <span data-label="author">
                        {props.messageItem.author}
                    </span>
                    <span data-label="msgLength">
                        消息长度: {msgLength()}
                    </span>
                    <span data-label="attachedItems">
                        {props.messageItem.attachedItems ? `上下文条目: ${props.messageItem.attachedItems}` : ''}
                    </span>
                    <span data-label="attachedChars">
                        {props.messageItem.attachedChars ? `上下文字数: ${props.messageItem.attachedChars}` : ''}
                    </span>
                    <Show when={props.messageItem.token}>
                        <span data-label="token" class="counter" style={{ padding: 0 }}>Token: {props.messageItem.token}</span>
                    </Show>

                    <div class="fn__flex-1" />

                    <ToolbarButton icon="iconEdit" title="编辑" onclick={editMessage} />
                    <ToolbarButton icon="iconCopy" title="复制" onclick={copyMessage} />
                    <ToolbarButton icon="iconLine" title="下方添加分隔" onclick={(e: MouseEvent) => {
                        e.stopPropagation();
                        e.preventDefault();
                        props.toggleSeperator?.();
                    }} />
                    <ToolbarButton icon="iconCut" title="新的分支" onclick={createNewBranch} />
                    <ToolbarButton
                        icon={props.messageItem.hidden ? "iconEyeoff" : "iconEye"}
                        title={props.messageItem.hidden ? "在上下文中显示" : "在上下文中隐藏"}
                        onclick={(e: MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            props.toggleHidden?.();
                        }}
                    />
                    <ToolbarButton icon="iconTrashcan" title="删除" onclick={(e: MouseEvent) => {
                        e.stopPropagation();
                        e.preventDefault();
                        // Ctrl + 点击
                        if (e.ctrlKey) {
                            deleteMessage();
                        } else {
                            showMessage('如果想要删除此消息，请按 Ctrl + 点击');
                        }
                    }} />
                    <ToolbarButton icon="iconRefresh" title="重新运行" onclick={(e: MouseEvent) => {
                        // Ctrl + 点击
                        if (e.ctrlKey) {
                            props.rerunIt?.();
                        } else {
                            showMessage('如果想要重新运行，请按 Ctrl + 点击');
                        }
                    }} />
                </div>
            </div>
        </div>
    )
}

export default MessageItem;
