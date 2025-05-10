/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-10
 * @FilePath     : /src/func/gpt/chat-in-doc/floating-chat.tsx
 * @Description  : 文档内对话浮动窗口
 */

import { onMount, onCleanup, createMemo, Show } from "solid-js";
import { createSignalRef } from "@frostime/solid-signal-ref";
import { floatingContainer } from "@/libs/components/floating-container";
import { getLute, getMarkdown, throttle } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";
import { complete } from "../openai/complete";
import { insertBlankMessage, insertAssistantMessage, parseDocumentToHistory, getDocumentInfo } from "./document-parser";
import { appendBlock, deleteBlock, exportMdContent } from "@frostime/siyuan-plugin-kits/api";
import styles from "./style.module.scss";
import { defaultModelId, listAvialableModels, useModel } from "../setting/store";
import SelectInput from "@/libs/components/Elements/SelectInput";
import { LeftRight } from "@/libs/components/Elements/Flex";
import { CheckboxInput } from "@/libs/components/Elements";


// import { LeftRight } from "@/libs/components/Elements/Flex";

const useTempHTMLBlock = (containerId: DocumentId | BlockId) => {
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
            const res = await appendBlock('markdown', initialHtml, containerId);
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
 * 获取文档内容
 * @param docId 文档ID
 * @param containerId 容器ID，可选，如果提供且不等于docId，则表示使用超级块模式
 * @returns 文档Markdown内容
 */
const getDocumentContent = async (docId: string): Promise<string> => {
    try {
        // 获取文档内容
        const result = await exportMdContent(docId, {
            yfm: true,
            refMode: 2,
            embedMode: 1
        });

        let content = result.content;
        return content;
    } catch (error) {
        console.error("获取文档内容失败", error);
        throw error;
    }
};

/**
 * 文档内对话窗口组件
 */
const ChatInDocWindow = (props: {
    document: DocumentId,
    containerId?: BlockId
}) => {
    // 状态管理
    const docId = props.document;
    let docTitle = createSignalRef("未知文档");
    let hpath = null;

    const isLoading = createSignalRef<boolean>(false);
    const modelId = createSignalRef<string>(defaultModelId());

    const useDocContext = createSignalRef<boolean>(false);

    let isMiniMode = props.containerId !== undefined;
    // 使用传入的containerId或默认为docId
    let containerId = props.containerId || docId;
    // const responseText = createSignalRef<string>("");

    let abort: () => void = null;

    // 获取当前文档信息
    onMount(async () => {
        if (isMiniMode) {
            let container = document.querySelector(`[data-node-id="${containerId}"]`) as HTMLElement;
            if (container) {
                // 添加活跃对话样式
                container.classList.add(styles.activeChatBlock);
            }
        }

        try {
            const docInfo = await getDocumentInfo(docId);
            docTitle(docInfo.content || "未命名文档");
            hpath = docInfo.hpath;
        } catch (error) {
            console.error("获取文档信息失败", error);
            showMessage("获取文档信息失败");
        }
    });

    onCleanup(() => {
        if (abort) {
            abort();
        }

        // 移除超级块的活跃样式
        if (isMiniMode) {
            const blockElement = document.querySelector(`[data-node-id="${containerId}"]`) as HTMLElement;
            if (blockElement) {
                blockElement.classList.remove(styles.activeChatBlock);
                blockElement.classList.remove(styles.pulsingChatBlock);
            }
        }
    });

    // 插入用户对话
    const handleInsertUserMessage = async () => {
        if (!containerId) {
            showMessage("未找到当前文档");
            return;
        }

        try {
            await insertBlankMessage(containerId, 'USER');
            // showMessage("已插入用户对话块");
        } catch (error) {
            console.error("插入用户对话失败", error);
            showMessage("插入用户对话失败");
        }
    };

    // 发送对话到GPT
    const handleSendToGPT = async () => {
        if (!containerId) {
            showMessage("未找到当前文档");
            return;
        }

        try {
            isLoading(true);
            // setResponseText("");

            // 添加脉冲效果
            if (isMiniMode) {
                const blockElement = document.querySelector(`[data-node-id="${containerId}"]`) as HTMLElement;
                if (blockElement) {
                    blockElement.classList.add(styles.pulsingChatBlock);
                }
            }

            // debugger
            // 获取文档内容
            let chatAreaMarkdown = '';
            if (isMiniMode) {
                chatAreaMarkdown = await getMarkdown(containerId);
                // 去掉超级块的标记符号
                chatAreaMarkdown = chatAreaMarkdown.trim().replace(/^{{{row/, '').replace(/}}}$/, '').trim();
            } else {
                chatAreaMarkdown = await getDocumentContent(docId);
            }
            const tempHTMLBlock = useTempHTMLBlock(containerId);

            // 解析为聊天历史
            const history = parseDocumentToHistory(chatAreaMarkdown);
            if (!history || !history.items || history.items.length === 0) {
                showMessage("未找到有效的对话内容");
                isLoading(false);
                return;
            }

            const msgs = history.items.map(item => item.message).filter(Boolean);
            const abortControler = new AbortController();
            abort = () => {
                abortControler.abort();
            }

            // 获取当前选择的模型
            const model = useModel(modelId());
            const modelDisplayName = modelId() === 'siyuan' ? '思源内置模型' : modelId().split('@')[0];

            let systemPrompt = '';
            let context = '';
            if (useDocContext()) {
                if (isMiniMode) {
                    const docContent = await getDocumentContent(docId);
                    context = docContent.replace(chatAreaMarkdown, '');
                } else {
                    // 在文档模式下, 将区域前面部分的所有内容当作上下文
                    context = history['preamble'];
                }
                systemPrompt = `
<document-content path="${hpath}">

${context}

</document-content>
You are provided with a document as context above, use the content if necessary.
RULE: Do not include this hint and the xml tags in your response!
`;
            }

            tempHTMLBlock.init();

            // 发送到GPT
            const response = await complete(msgs, {
                model: model,
                systemPrompt: useDocContext() ? systemPrompt : '',
                stream: true,
                streamMsg: (msg: string) => {
                    // setResponseText(msg);
                    tempHTMLBlock.update(msg);
                },
                abortControler
            });
            abort = null;
            isLoading(false);
            tempHTMLBlock.remove();

            // 移除脉冲效果
            if (isMiniMode) {
                const blockElement = document.querySelector(`[data-node-id="${containerId}"]`) as HTMLElement;
                if (blockElement) {
                    blockElement.classList.remove(styles.pulsingChatBlock);
                }
            }

            // 插入助手回复
            await insertAssistantMessage(containerId, response.content, modelDisplayName);
            await insertBlankMessage(containerId, 'USER');

            // showMessage("对话已完成");
        } catch (error) {
            console.error("发送对话失败", error);
            showMessage("发送对话失败");
            isLoading(false);

            // 确保在错误情况下也移除脉冲效果
            if (isMiniMode) {
                const blockElement = document.querySelector(`[data-node-id="${containerId}"]`) as HTMLElement;
                if (blockElement) {
                    blockElement.classList.remove(styles.pulsingChatBlock);
                }
            }
        }
    };

    // 创建模型选项
    const modelOptions = createMemo(() => {
        return listAvialableModels();
    });

    return (
        <div style={{
            padding: "8px", display: "flex",
            "flex-direction": "column", gap: "12px", zoom: 0.8
        }}>
            <LeftRight
                left={<span style={{ "font-weight": "bold" }}>{docTitle()}</span>}
                right={(
                    <Show when={isLoading()}>
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
                    </Show>
                )}
            />

            <LeftRight
                left={<span>消息</span>}
                right={
                    <>
                        <button
                            class="b3-button"
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
                                isLoading(false);
                            }}
                            disabled={!isLoading()}
                            title="中断当前的GPT响应"
                        >
                            中断
                        </button>

                        <span style="width: 5px;" />

                        <button
                            class="b3-button b3-button--outline"
                            onClick={handleInsertUserMessage}
                            disabled={isLoading()}
                            title="在文档末尾插入一个新的用户消息块"
                        >
                            用户
                        </button>
                    </>
                }
                rightStyle={{
                    display: "flex",
                    gap: "5px",
                }}
            />

            <LeftRight
                left={<span>文档前文</span>}
                right={
                    <CheckboxInput checked={useDocContext()} changed={(value) => useDocContext(value)} />
                }
            />

            <LeftRight
                left={<span>模型</span>}
                right={
                    <SelectInput
                        value={modelId()}
                        changed={(value) => modelId(value)}
                        options={modelOptions()}
                        style={{
                            width: "180px"
                        }}
                    />
                }
            />
        </div>
    );
};

/**
 * 打开文档内对话窗口
 * @param insideDoc 文档ID
 * @param containerId 容器ID，可选，如果提供则将消息添加到该容器中
 */
export const openChatInDocWindow = (insideDoc: DocumentId, containerId?: BlockId) => {
    // 获取窗口尺寸，用于计算右下角位置
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    return floatingContainer({
        component: () => <ChatInDocWindow document={insideDoc} containerId={containerId} />,
        title: containerId === undefined ? "文档内对话" : "文档内对话(Mini)",
        // style: {
        //     width: "200px",
        //     height: "auto"
        // },
        initialPosition: {
            x: windowWidth - 300, // 窗口宽度 - 浮动窗口宽度 - 边距
            y: windowHeight - 200 // 窗口高度 - 浮动窗口高度 - 边距
        },
        allowResize: false
    });
};
