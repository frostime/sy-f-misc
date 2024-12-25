import { showMessage } from 'siyuan';
import { Accessor, batch } from 'solid-js';
import { IStoreRef, useSignalRef, useStoreRef } from '@frostime/solid-signal-ref';
import Form from '@/libs/components/Form';
import { createSimpleContext } from '@/libs/simple-context';

import { ChatSetting } from '../setting';
import { UIConfig, promptTemplates } from '../setting/store';
import * as gpt from '../gpt';

interface ISimpleContext {
    model: Accessor<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    session: ReturnType<typeof useSession>;
}

const { SimpleProvider, useSimpleContext } = createSimpleContext<ISimpleContext>();

export {
    SimpleProvider,
    useSimpleContext
}

/**
 * 
 */
export const useSession = (props: {
    model: Accessor<IGPTModel>;
    config: IStoreRef<IChatSessionConfig>;
    scrollToBottom: () => void;
}) => {
    let sessionId = window.Lute.NewNodeID();

    const systemPrompt = useSignalRef<string>('');

    let timestamp = new Date().getTime();
    const title = useSignalRef<string>('新的对话');
    const messages = useStoreRef<IChatSessionMsgItem[]>([]);
    const loading = useSignalRef<boolean>(false);
    // const streamingReply = useSignalRef<string>('');

    let hasStarted = false;

    const newID = () => {
        return window.Lute.NewNodeID();
    }

    const endWithSeperator = () => {
        if (messages().length === 0) return false;
        return messages()[messages().length - 1].type === 'seperator';
    }

    const appendUserMsg = (msg: string) => {
        messages.update(prev => [...prev, {
            type: 'message',
            id: newID(),
            timestamp: new Date().getTime(),
            author: 'user',
            message: {
                role: 'user',
                content: msg
            }
        }]);
    }


    const appendSeperator = (index?: number) => {
        if (messages().length === 0) return;
        const last = messages()[messages().length - 1];
        if (last.type === 'seperator') return;
        messages.update(prev => [...prev, {
            type: 'seperator',
            id: newID()
        }]);
    }

    const removeSeperator = () => {
        if (messages().length === 0) return;
        const last = messages()[messages().length - 1];
        if (last.type === 'seperator') {
            messages.update(prev => prev.slice(0, -1));
        }
    }

    const getAttachedHistory = (attachedHistory?: number, fromIndex?: number) => {
        if (attachedHistory === undefined) {
            attachedHistory = props.config().attachedHistory;
        }
        const history = [...messages()];
        const targetIndex = fromIndex ?? history.length - 1;
        const targetMessage = history[targetIndex];

        if (attachedHistory === 0) {
            return [targetMessage.message!];
        }

        // 从指定位置向前截取历史消息
        const previousMessages = history.slice(0, targetIndex);
        const lastMessages = attachedHistory > 0 ? previousMessages.slice(-attachedHistory) : previousMessages;
        const lastSeperatorIndex = lastMessages.findIndex(item => item.type === 'seperator');

        let attachedMessages: IChatSessionMsgItem[] = [];
        if (lastSeperatorIndex === -1) {
            attachedMessages = lastMessages.filter(item => item.type === 'message');
        } else {
            attachedMessages = lastMessages.slice(lastSeperatorIndex + 1).filter(item => item.type === 'message');
        }

        return [...attachedMessages, targetMessage].map(item => item.message!);
    }


    let controller: AbortController;

    // src/func/gpt/components/ChatSession.tsx
    const gptOption = () => {
        let option = { ...props.config().chatOption };
        return option;
    }

    const customComplete = async (messageToSend: IMessage[] | string, stream: boolean = false) => {
        try {
            let model = props.model();
            const { content } = await gpt.complete(messageToSend, {
                model: model,
                option: gptOption(),
                stream: stream,
            });
            return content;
        } catch (error) {
            console.error('Error:', error);
        }
    }

    const autoGenerateTitle = async () => {
        let attachedHistory = props.config().attachedHistory;
        attachedHistory = Math.max(attachedHistory, 2);
        attachedHistory = Math.min(attachedHistory, 6);
        const histories = getAttachedHistory(attachedHistory);
        if (histories.length == 0) return;
        let sizeLimit = props.config().maxInputLenForAutoTitle;
        let averageLimit = Math.floor(sizeLimit / histories.length);

        let inputContent = histories.map(item => {
            let clippedContent = item.content.substring(0, averageLimit);
            if (clippedContent.length < item.content.length) {
                clippedContent += '...(clipped as too long)'
            }
            return `<${item.role}>:\n${clippedContent}`;
        }).join('\n\n');
        const messageToSend = `
请根据以下对话生成唯一一个最合适的对话主题标题，字数控制在 15 字之内; 除了标题之外不要回复任何别的信息
---
${inputContent}
`.trim();
        const newTitle = await customComplete(messageToSend);
        if (newTitle?.trim()) {
            title.update(newTitle.trim());
        }
    }

    /**
     * 首先检查 index 是否在合法范围内
     * 确认无误
     * 如果为 user 信息，则同 sendMessage 逻辑一样，把 user 消息当作最新的输入，获得的 gpt 结果
     *  - 如果下一条本来就是 assistant 信息，则直接替换
     *  - 如果下一条是 user 信息，则插入一条新的 assistant 信息
     * 如果为 assistant 信息
     *  - 如果他的上一条为 user 信息，则等价于上面的情况，也就是最后会更新他自己
     *  - 如果他的上一条为 assistant 信息，则拒绝执行 rerun，并showMessage 报错
     */
    const reRunMessage = async (atIndex: number) => {
        if (atIndex < 0 || atIndex >= messages().length) return;
        const targetMsg = messages()[atIndex];
        if (targetMsg.type !== 'message') return;

        // 如果是 assistant 消息，检查上一条是否为 user 消息
        if (targetMsg.message.role === 'assistant') {
            if (atIndex === 0 || messages()[atIndex - 1].message?.role !== 'user') {
                showMessage('无法重新生成此消息：需要用户输入作为前文');
                return;
            }
            atIndex = atIndex - 1; // 将焦点移到上一条 user 消息
        }

        loading.update(true);
        // props.scrollToBottom(); //不要滚动到最底部

        try {
            controller = new AbortController();
            const msgToSend = getAttachedHistory(props.config().attachedHistory, atIndex);
            let model = props.model();
            let option = gptOption();
            // 更新或插入 assistant 消息
            const nextIndex = atIndex + 1;
            // const nextMsg = messages()[nextIndex];

            // 准备或更新目标消息
            if (messages()[nextIndex]?.message?.role === 'assistant') {
                messages.update(prev => {
                    const updated = [...prev];
                    updated[nextIndex] = {
                        ...updated[nextIndex],
                        loading: true
                    };
                    return updated;
                });
            } else {
                messages.update(prev => {
                    const updated = [...prev];
                    updated.splice(nextIndex, 0, {
                        type: 'message',
                        id: newID(),
                        timestamp: new Date().getTime(),
                        author: model.model,
                        loading: true,
                        message: {
                            role: 'assistant',
                            content: ''
                        }
                    });
                    return updated;
                });
            }

            const { content, usage } = await gpt.complete(msgToSend, {
                model: model,
                systemPrompt: systemPrompt().trim() || undefined,
                stream: option.stream ?? true,
                streamInterval: 2,
                streamMsg(msg) {
                    messages.update(nextIndex, 'message', 'content', msg);
                    // props.scrollToBottom();
                },
                abortControler: controller,
                option: option,
            });


            // 更新最终内容
            messages.update(prev => {
                const updated = [...prev];
                updated[nextIndex] = {
                    ...updated[nextIndex],
                    loading: false,
                    message: {
                        role: 'assistant',
                        content: content
                    },
                    author: model.model,
                    timestamp: new Date().getTime(),
                };
                delete updated[nextIndex]['loading'];  //不需要这个了
                return updated;
            });

            if (usage) {
                batch(() => {
                    messages.update(nextIndex, 'token', usage?.completion_tokens);
                    messages.update(atIndex, 'token', usage?.prompt_tokens);
                });
            }

            // props.scrollToBottom(); rerun, 不需要滚动到底部
        } catch (error) {
            console.error('Error:', error);
        } finally {
            loading.update(false);
            controller = null;
        }
    };

    const sendMessage = async (userMessage: string) => {
        if (!userMessage.trim()) return;

        const hasContext = userMessage.includes('</Context>');
        let sysPrompt = systemPrompt().trim() || '';
        if (hasContext) {
            sysPrompt += 'Note: <Context>...</Context> 是附带的上下文信息，只关注其内容，不要将 <Context> 标签作为正文的一部分';
        }

        appendUserMsg(userMessage);
        loading.update(true);
        props.scrollToBottom();

        try {
            controller = new AbortController();
            const msgToSend = getAttachedHistory();
            let model = props.model();
            let option = gptOption();

            // 添加助手消息占位
            const assistantMsg: IChatSessionMsgItem = {
                type: 'message',
                id: newID(),
                token: null,
                message: { role: 'assistant', content: '' },
                author: model.model,
                timestamp: new Date().getTime(),
                loading: true
            };
            messages.update(prev => [...prev, assistantMsg]);

            const lastIdx = messages().length - 1;
            const { content, usage } = await gpt.complete(msgToSend, {
                model: model,
                systemPrompt: sysPrompt || undefined,
                stream: option.stream ?? true,
                streamInterval: 2,
                streamMsg(msg) {
                    messages.update(lastIdx, 'message', 'content', msg);
                    props.scrollToBottom();
                },
                abortControler: controller,
                option: option,
            });

            // 更新最终内容
            messages.update(prev => {
                const lastIdx = prev.length - 1;
                const updated = [...prev];
                updated[lastIdx] = {
                    ...updated[lastIdx],
                    loading: false,
                    message: {
                        role: 'assistant',
                        content: content
                    },
                    author: model.model,
                    timestamp: new Date().getTime()
                };
                delete updated[lastIdx]['loading'];
                return updated;
            });

            if (usage) {
                batch(() => {
                    const lastIdx = messages().length - 1;
                    if (lastIdx < 1) return;
                    messages.update(lastIdx, 'token', usage?.completion_tokens);
                    messages.update(lastIdx - 1, 'token', usage?.prompt_tokens);
                });
            }

            props.scrollToBottom();

            if (!hasStarted) {
                hasStarted = true;
                if (messages().length <= 2) {
                    setTimeout(autoGenerateTitle, 100);
                }
            }

        } catch (error) {
            console.error('Error:', error);
        } finally {
            loading.update(false);
            controller = null;
        }
    }

    const abortMessage = () => {
        if (loading()) {
            controller && controller.abort();
        }
    }

    return {
        systemPrompt,
        messages,
        loading,
        title,
        autoGenerateTitle,
        reRunMessage,
        sendMessage,
        abortMessage,
        toggleClearContext: () => {
            if (endWithSeperator()) {
                removeSeperator();
            } else {
                appendSeperator();
            }
            props.scrollToBottom();
        },
        sessionHistory: (): IChatSessionHistory => {
            return {
                id: sessionId,
                timestamp,
                title: title(),
                items: messages.unwrap()
            }
        },
        applyHistory: (history: IChatSessionHistory) => {
            history.id && (sessionId = history.id);
            history.title && (title.update(history.title));
            history.timestamp && (timestamp = history.timestamp);
            history.items && (messages.update(history.items));
        },
        newSession: () => {
            sessionId = window.Lute.NewNodeID();
            systemPrompt.update('');
            timestamp = new Date().getTime();
            title.update('新的对话');
            messages.update([]);
            loading.update(false);
            hasStarted = false;
        }
    }
}


export const useSessionSetting = () => {
    let context = useSimpleContext();
    let { config, session } = context;

    const availableSystemPrompts = (): Record<string, string> => {
        const systemPrompts = promptTemplates().filter(item => item.type === 'system');
        return systemPrompts.reduce((acc, cur) => {
            acc[cur.content] = cur.name;
            return acc;
        }, { '': 'No Prompt' });
    }

    return (
        <div class="fn__flex-1">
            <Form.Wrap
                title="System Prompt"
                description="附带的系统级提示消息"
                direction="row"
                action={
                    <Form.Input
                        type="select"
                        value={""}
                        changed={(v) => {
                            v = v.trim();
                            if (v) {
                                session.systemPrompt(v);
                            }
                        }}
                        options={availableSystemPrompts()}
                    />
                }
            >
                <Form.Input
                    type="textarea"
                    value={session.systemPrompt()}
                    changed={(v) => {
                        session.systemPrompt(v);
                    }}
                    style={{
                        height: '7em',
                        "font-size": UIConfig().inputFontsize + "px",
                        "line-height": "1.35"
                    }}
                />
            </Form.Wrap>
            <ChatSetting config={config} />
        </div>
    )

}