/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-10
 * @FilePath     : /src/func/gpt/chat-in-doc/floating-chat.tsx
 * @Description  : 文档内对话浮动窗口
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import { floatingContainer } from "@/libs/components/floating-container";
import { getActiveDoc, getLute } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";
import { complete } from "../openai/complete";
import { insertBlankMessage, insertAssistantMessage, getDocumentContent, parseDocumentToHistory, getDocumentInfo } from "./document-parser";
import { appendBlock, deleteBlock } from "@frostime/siyuan-plugin-kits/api";

const useTempHTMLBlock = (docId: DocumentId) => {
    const html = `<div>处理中...</div>`;
    let id = null;
    let dom = null;

    const lute = getLute();

    return {
        init: async () => {
            const res = await appendBlock('markdown', html, docId);
            id = res[0].doOperations[0].id;
            console.debug('Temp HTML Block ID:', id);
            dom = document.querySelector(`[data-node-id="${id}"] protyle-html`) as HTMLElement;
        },
        update: (markdown: string) => {
            if (!dom) return;
            // @ts-ignore
            let html = lute.Md2HTML(markdown);
            dom?.setAttribute('data-content', html);
        },
        remove: () => {
            if (id) {
                deleteBlock(id);
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
            <div style={{ "font-weight": "bold" }}>当前文档: {docTitle()}</div>

            <div style={{ display: "flex", gap: "8px" }}>
                <button
                    class="b3-button"
                    onClick={handleInsertUserMessage}
                    disabled={isLoading()}
                >
                    用户
                </button>
                <button
                    class="b3-button b3-button--outline"
                    onClick={handleSendToGPT}
                    disabled={isLoading()}
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
                >
                    中断
                </button>
                {/* <button
                    class="b3-button"
                    onClick={handleInsertSystemMessage}
                    disabled={isLoading()}
                >
                    系统
                </button> */}
            </div>

            {/* <div
                style={{
                    "min-height": "200px",
                    "max-height": "400px",
                    "overflow-y": "auto",
                    "border": "1px solid var(--b3-border-color)",
                    "border-radius": "4px",
                    "padding": "8px",
                    "white-space": "pre-wrap"
                }}
            >
                {isLoading() ? responseText() : "在 <USER/> 下方编写你的问题，点击\"发送\"进行对话"}
            </div> */}
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
