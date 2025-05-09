/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-10
 * @FilePath     : /src/func/gpt/chat-in-doc/floating-chat.tsx
 * @Description  : 文档内对话浮动窗口
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import { floatingContainer } from "@/libs/components/floating-container";
import { getActiveDoc, getLute, throttle } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";
import { complete } from "../openai/complete";
import { insertBlankMessage, insertAssistantMessage, getDocumentContent, parseDocumentToHistory, getDocumentInfo } from "./document-parser";
import { appendBlock, deleteBlock } from "@frostime/siyuan-plugin-kits/api";
import styles from "./style.module.scss";
// import { LeftRight } from "@/libs/components/Elements/Flex";

const useTempHTMLBlock = (docId: DocumentId) => {
    // 使用我们定义的样式创建初始HTML
    const initialHtml = `<div class="${styles.streamingContainer}">
    AI 正在生成回复...
</div>`;

    let id = null;
    let domNode = null;
    let domCustomHTML = null;

    const lute = getLute();

    const pushUserInputEvent = () => {
        const event = new Event('input', {
            bubbles: true,
            cancelable: false
        });
        domNode?.dispatchEvent(event);
    }

    const dispatchEvent = throttle(pushUserInputEvent, 1000);

    return {
        init: async () => {
            const res = await appendBlock('markdown', initialHtml, docId);
            id = res[0].doOperations[0].id;
            console.debug('Temp HTML Block ID:', id);
            domNode = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
            domNode.classList.add(styles.streamingContainer);
            domCustomHTML = document.querySelector(`[data-node-id="${id}"] protyle-html`) as HTMLElement;

            const icon = domNode.querySelector('.protyle-icons') as HTMLElement;
            if (icon) {
                icon.style.display = 'none';
            }
        },
        update: (markdown: string) => {
            if (!domCustomHTML) return;

            // 使用Lute将Markdown转换为HTML
            // @ts-ignore
            let contentHtml = lute.Md2HTML(markdown);

            // 更新DOM
            domCustomHTML.setAttribute('data-content', contentHtml);
            dispatchEvent();
        },
        remove: () => {
            if (id) {
                // 添加淡出类
                domNode.classList.add(styles.fadeOut);
                dispatchEvent();

                // 淡出动画完成后设置 display: none
                setTimeout(() => {
                    domNode.style.display = 'none';
                    dispatchEvent();

                    // 然后再删除元素
                    setTimeout(() => {
                        deleteBlock(id);
                    }, 2000);
                }, 500); // 与动画时间匹配
            }
        }
    }
}

/**
 * 文档内对话窗口组件
 */
const ChatInDocWindow = () => {
    // 状态管理
    const [docId, setDocId] = createSignal<string>("");
    const [docTitle, setDocTitle] = createSignal<string>("未知文档");
    const [isLoading, setIsLoading] = createSignal<boolean>(false);
    // const [responseText, setResponseText] = createSignal<string>("");

    let abort: () => void = null;

    // 获取当前文档信息
    onMount(async () => {
        const activeDocId = getActiveDoc();
        if (!activeDocId) {
            showMessage("未找到当前文档");
            return;
        }

        setDocId(activeDocId);

        try {
            const docInfo = await getDocumentInfo(activeDocId);
            setDocTitle(docInfo.content || "未命名文档");
        } catch (error) {
            console.error("获取文档信息失败", error);
            showMessage("获取文档信息失败");
        }
    });

    onCleanup(() => {
        if (abort) {
            abort();
        }
    });

    // 插入用户对话
    const handleInsertUserMessage = async () => {
        if (!docId()) {
            showMessage("未找到当前文档");
            return;
        }

        try {
            await insertBlankMessage(docId(), 'USER');
            showMessage("已插入用户对话块");
        } catch (error) {
            console.error("插入用户对话失败", error);
            showMessage("插入用户对话失败");
        }
    };

    // 发送对话到GPT
    const handleSendToGPT = async () => {
        if (!docId()) {
            showMessage("未找到当前文档");
            return;
        }

        try {
            setIsLoading(true);
            // setResponseText("");

            // 获取文档内容
            const content = await getDocumentContent(docId());
            const tempHTMLBlock = useTempHTMLBlock(docId());

            // 解析为聊天历史
            const history = parseDocumentToHistory(content);
            if (!history || !history.items || history.items.length === 0) {
                showMessage("未找到有效的对话内容");
                setIsLoading(false);
                return;
            }

            const preamble = history['preamble'];

            console.debug('Preamble:', preamble);

            const msgs = history.items.map(item => item.message).filter(Boolean);
            const abortControler = new AbortController();
            abort = () => {
                abortControler.abort();
            }
            tempHTMLBlock.init();
            // 发送到GPT
            const response = await complete(msgs, {
                stream: true,
                streamMsg: (msg: string) => {
                    // setResponseText(msg);
                    tempHTMLBlock.update(msg);
                },
                abortControler
            });
            abort = null;
            setIsLoading(false);
            tempHTMLBlock.remove();
            // 插入助手回复
            await insertAssistantMessage(docId(), response.content);
            await insertBlankMessage(docId(), 'USER');

            showMessage("对话已完成");
        } catch (error) {
            console.error("发送对话失败", error);
            showMessage("发送对话失败");
            setIsLoading(false);
        }
    };

    return (
        <div style={{ padding: "8px", display: "flex", "flex-direction": "column", gap: "12px" }}>
            <div style={{ "font-weight": "bold", display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                <span>当前文档: {docTitle()}</span>
                {isLoading() && (
                    <span style={{
                        "font-size": "12px",
                        "color": "var(--b3-theme-primary)",
                        "display": "flex",
                        "align-items": "center",
                        "gap": "4px"
                    }}>
                        <span style={{
                            "display": "inline-block",
                            "width": "8px",
                            "height": "8px",
                            "border-radius": "50%",
                            "background-color": "var(--b3-theme-primary)",
                            "animation": "fadeInOut 1s ease-in-out infinite"
                        }}></span>
                        AI 正在响应...
                    </span>
                )}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
                <button
                    class="b3-button"
                    onClick={handleInsertUserMessage}
                    disabled={isLoading()}
                    title="在文档末尾插入一个新的用户消息块"
                >
                    用户
                </button>
                <button
                    class="b3-button b3-button--outline"
                    onClick={handleSendToGPT}
                    disabled={isLoading()}
                    title="发送文档中的对话到GPT"
                >
                    发送
                </button>
                <button
                    class="b3-button b3-button--outline"
                    onClick={() => {
                        if (!abort || !isLoading()) return;
                        abort();
                        setIsLoading(false);
                    }}
                    disabled={!isLoading()}
                    title="中断当前的GPT响应"
                >
                    中断
                </button>
            </div>
        </div>
    );
};

/**
 * 打开文档内对话窗口
 */
export const openChatInDocWindow = () => {
    return floatingContainer({
        component: () => <ChatInDocWindow />,
        title: "文档内对话",
        style: {
            width: "400px",
            height: "auto"
        },
        allowResize: true
    });
};
