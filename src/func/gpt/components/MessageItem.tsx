import { Component, createEffect, createMemo, For, on, onMount, Show } from 'solid-js';
import { formatDateTime, getLute, html2ele, inputDialog, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { confirm, Menu } from "siyuan";

import styles from './MessageItem.module.scss';
import AttachmentList from './AttachmentList';
import { adaptIMessageContent, addScript, addStyle, convertMathFormulas } from '../utils';
import { Constants, showMessage } from 'siyuan';
import { defaultConfig } from '../setting/store';
import { useSimpleContext } from './UseSession';


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
        <div class="fn__flex-1"></div>
        <span class="b3-label__text" style="font-family: var(--b3-font-family-code); margin: 0px;">
            ${language}
        </span>
        ${language.toLocaleLowerCase() === 'html' ? RUN_BUTTON : ''}
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
    return window.hljs !== undefined && window.hljs !== null;
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

const MessageItem: Component<{
    messageItem: IChatSessionMsgItem,
    markdown?: boolean,
    updateIt?: (message: string) => void,
    deleteIt?: () => void,
    rerunIt?: () => void,
    switchVersion?: (version: string) => void,
    multiSelect?: boolean,
    selected?: boolean,
    onSelect?: (id: string, selected: boolean) => void,
    toggleSeperator?: () => void,
    toggleHidden?: () => void
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

    onMount(async () => {
        //仅仅只在需要配置调整 Lute 渲染的 markdown 内容时才会执行
        if (props.markdown !== true) return;
        renderCode();
        renderMath();
    });

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

    createEffect(on(textContent, () => {
        renderCode();
        renderMath();
    }));

    const VersionHooks = {
        hasMultiVersion: () => {
            return Object.keys(props.messageItem.versions).length > 1;
        },
        versionKeys: () => {
            return Object.keys(props.messageItem.versions).map((v, index) => `v${index + 1}`);
        },
        currentVersion: () => {
            let index = 1;
            if (props.messageItem.versions[props.messageItem.currentVersion]) {
                index = Object.keys(props.messageItem.versions).indexOf(props.messageItem.currentVersion) + 1;
            }
            return `v${index}`;
        },
        switchVersionMenu: () => {
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
            icon: 'iconLine',
            label: '下方添加分隔',
            click: () => props.toggleSeperator?.()
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
        if (Object.keys(props.messageItem.versions).length > 1) {
            menu.addItem({
                icon: 'iconHistory',
                label: '切换消息版本',
                type: 'submenu',
                submenu: VersionHooks.switchVersionMenu()
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

    return (
        <div class={styles.messageItem} data-role={props.messageItem.message.role}>
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
            {props.messageItem.message.role === 'user' ? (
                <div class={styles.icon}><IconUser /></div>
            ) : (
                <div class={styles.icon}><IconAssistant /></div>
            )}
            <div class={styles.messageContainer}>
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
