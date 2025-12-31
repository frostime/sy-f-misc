/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 14:55:08
 * @FilePath     : /src/func/gpt/persistence/import-platform.ts
 * @LastEditTime : 2025-12-31 01:19:47
 * @Description  :
 */
import { showMessage } from "siyuan";
import { ensureRootDocument, formatSingleItem, parseMarkdownToChatHistory } from "./sy-doc";
import { formatDateTime, getLute, getNotebook, html2ele, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { createDocWithMd } from "@frostime/siyuan-plugin-kits/api";
import { openChatTab } from "..";


const exportDoc = async (title: string, rootDoc: Block, content: string) => {
    title = formatDateTime('yyyy-MM-dd', new Date()) + ' ' + title;
    let path = rootDoc.hpath;
    await createDocWithMd(rootDoc.box, `${path}/${title}`, content);
    showMessage(`保存到 ${getNotebook(rootDoc.box).name}${path}/${title}`);
}

const importDialog = (title: string, markdown: string) => {

    const html = `
    <div class="fn__fle-1 fn__flex fn__flex-column" style="height: 100%; flex: 1; gap: 3px; padding: 8px 12px; box-sizing: border-box;">
    <div data-type="row" style="font-size: 17px; display: flex; gap: 5px; align-items: center;">
        <span style="font-weight: 500; flex: 1;">${title}</span>
        <button class="b3-button b3-button--text" id="download">下载 Markdown 文件</button>
        <button class="b3-button b3-button--text" id="toSiYuan">导入到思源中</button>
        <button class="b3-button b3-button--text" id="open-chat">作为对话打开</button>
    </div>
    <textarea class="b3-text-field fn__block" style="font-size: 18px; resize: none; flex: 1;" spellcheck="false"></textarea>
    </div>
    `;
    const ele = html2ele(html);
    const textarea = ele.querySelector('textarea') as HTMLTextAreaElement;

    textarea.value = markdown;

    const download = () => {
        let text = textarea.value;
        if (!text) return;
        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = title + '.md';
        a.click();
        showMessage('下载成功');
        URL.revokeObjectURL(url);
    }

    (ele.querySelector('button#download') as HTMLButtonElement).onclick = download

    const openChat = () => {
        const history = parseMarkdownToChatHistory(markdown);
        if (!history) {
            showMessage('格式不符合解析标准，无法打开', 3000, 'error');
        } else {
            history.title = title || history.title;
            // 确保 udpated > timestamp; 不然打开对话之后不会被自动缓存
            // 参考 ChatSession.helper.ts hasUpdated() 函数
            history.updated = history.timestamp + 10;
            openChatTab(false, history);
            dialog.close();
        }
    }

    (ele.querySelector('button#open-chat') as HTMLButtonElement).onclick = openChat

    const toSiYuan = async () => {
        let rootDoc = await ensureRootDocument('导出对话文档');
        if (!rootDoc) {
            showMessage('创建导出文档位置失败', 3000, 'error');
            return;
        }
        await exportDoc(title, rootDoc, markdown);
        dialog.close();
    }

    (ele.querySelector('button#toSiYuan') as HTMLButtonElement).onclick = toSiYuan;

    const dialog = simpleDialog({
        title: title,
        ele: ele,
        width: '1200px',
        height: '700px',
    });
}


type ParsedChatResult = { name?: string; content?: string; history?: IChatSessionHistoryV2 };

const chooseFileAndParse = async (parser: (text: string) => ParsedChatResult, filter: string = '') => {
    return new Promise((resolve) => {
        // 创建文件选择输入框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = filter;

        // 监听文件选择事件
        fileInput.onchange = function (event: Event) {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) {
                resolve({ succeed: false, name: '', content: 'No file selected.' });
                return;
            }

            // 读取文件内容
            const reader = new FileReader();
            reader.onload = function (event) {
                try {
                    const result = parser(event.target?.result as string);
                    if (result) {
                        resolve({ succeed: true, name: result?.name || file.name, content: result.content, history: result.history });
                    } else {
                        resolve({ succeed: false, name: file.name, content: 'Failed to parse file' });
                    }
                } catch (error) {
                    resolve({ succeed: false, name: file.name, content: 'Error parsing file' + error });
                }
            };

            reader.onerror = function (error) {
                resolve({ succeed: false, name: file.name, content: 'Error reading file' + error });
            };

            reader.readAsText(file, 'UTF-8');
        };

        // 触发文件选择
        fileInput.click();
    });
}


const parseGoogleAIStudioFile = (content: string): ParsedChatResult => {
    const prompts = JSON.parse(content);
    const nodes: Record<string, IChatSessionMsgItemV2> = {};
    const worldLine: string[] = [];
    const timestamp = Date.now();
    const defaultModel = prompts.runSettings?.model;

    const chunks = prompts.chunkedPrompt.chunks;
    chunks.forEach((chunk, index) => {
        // #TODO 后面考虑怎么处理 think 部分
        if (chunk.text && chunk?.isThought !== true) {
            let role = chunk.role;
            if (role === 'model') {
                role = 'ASSISTANT';
            } else if (role === 'user') {
                role = 'USER';
            } else if (role === 'system') {
                role = 'SYSTEM';
            } else {
                return;
            }
            const id = `google-${index}`;
            const versionId = `${id}-v1`;
            const roleLower = role.toLowerCase();
            nodes[id] = {
                id,
                type: 'message',
                role: roleLower as any,
                currentVersionId: versionId,
                versions: {
                    [versionId]: {
                        id: versionId,
                        message: {
                            role: roleLower as any,
                            content: chunk.text,
                        },
                        author: roleLower,
                        timestamp,
                        time: { latency: 0 },
                        metadata: roleLower === 'assistant' ? { model: defaultModel } : undefined,
                    } as any,
                },
                parent: index === 0 ? null : worldLine[worldLine.length - 1],
                children: [],
            };
            if (index > 0) {
                const prevId = worldLine[worldLine.length - 1];
                nodes[prevId].children.push(id);
            }
            worldLine.push(id);
        }
    });

    const rootId = worldLine[0] || null;
    const history: IChatSessionHistoryV2 = {
        schema: 2,
        type: 'history',
        id: `google-${timestamp}`,
        title: 'Google AI Studio Chat',
        timestamp,
        updated: timestamp + 10,
        tags: [],
        sysPrompt: prompts.systemInstruction?.text,
        modelBareId: undefined,
        customOptions: {},
        nodes,
        rootId,
        worldLine,
    };
    return { name: history.title, history };
}

const normalizeTimestamp = (ts?: number) => {
    if (!ts || Number.isNaN(ts)) return undefined;
    // Aizex exports seconds since epoch; guard for ms
    return ts > 1e12 ? ts : ts * 1000;
}

const extractAizexContent = (msg: any): string => {
    if (!msg?.content) return '';
    const c = msg.content;
    const type = c.content_type;
    if (type === 'text' && Array.isArray(c.parts)) {
        return c.parts.join('\n\n').trim();
    }
    if (type === 'reasoning_recap' && typeof c.content === 'string') {
        return c.content.trim();
    }
    if (type === 'thoughts' && Array.isArray(c.thoughts)) {
        return c.thoughts.map(t => t?.content || t?.summary || '').filter(Boolean).join('\n\n').trim();
    }
    if (typeof c.content === 'string') {
        return c.content.trim();
    }
    return '';
}

function parseAizexLegacyClaude(content: string): ParsedChatResult {
    const prompts = JSON.parse(content);
    const name = prompts.name;
    const messages = prompts.chat_messages;
    let markdownText = '';
    const senderMap: Record<string, string> = {
        human: 'USER',
        assistant: 'ASSISTANT',
    };
    messages.forEach((message, index) => {
        const sender = senderMap[message.sender];
        if (!sender) return;
        const content = message.content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text)
            .join('\n');
        if (!content) return;
        const attr: Record<string, string> = { index: index.toString() };
        if (sender === 'ASSISTANT') {
            attr['model'] = 'Claude';
        }
        const item = formatSingleItem(sender, content, attr);
        markdownText += item + '\n\n';
    });
    return { name, content: markdownText };
}

const parseAizexFile = (content: string): ParsedChatResult => {
    const data = JSON.parse(content);

    // Legacy export with chat_messages
    if (Array.isArray(data?.chat_messages)) {
        return parseAizexLegacyClaude(content);
    }

    const mapping = data?.mapping || {};
    let currentId: string | null = data?.current_node || null;

    // Fallback to root (parent is null) or first key
    if (!currentId || !mapping[currentId]) {
        const root = Object.keys(mapping).find(id => mapping[id]?.parent === null);
        currentId = root || Object.keys(mapping)[0] || null;
    }

    if (!currentId) {
        return { name: data?.title || 'Aizex Chat', content: '' };
    }

    const visited = new Set<string>();
    const chain: string[] = [];
    let iter: string | null = currentId;
    while (iter && mapping[iter] && !visited.has(iter)) {
        chain.push(iter);
        visited.add(iter);
        iter = mapping[iter].parent || null;
    }
    chain.reverse(); // root -> leaf

    const defaultModel = data?.default_model_slug;
    const nodes: Record<string, IChatSessionMsgItemV2> = {};

    // first pass: create nodes for all valid messages
    Object.entries(mapping).forEach(([id, nodeData]: [string, any]) => {
        const msg = nodeData?.message;
        if (!msg) return;
        const author = msg.author?.role;
        if (!author || author === 'tool') return;
        if (msg.metadata?.is_visually_hidden_from_conversation) return;

        const text = extractAizexContent(msg);
        if (!text) return;

        const ts = normalizeTimestamp(msg.create_time);
        const model = msg.metadata?.model_slug || msg.metadata?.default_model_slug || defaultModel;

        const versionId = `${id}-v1`;
        const roleLower = author.toLowerCase();

        nodes[id] = {
            id,
            type: 'message',
            role: roleLower as any,
            currentVersionId: versionId,
            versions: {
                [versionId]: {
                    id: versionId,
                    message: {
                        role: roleLower as any,
                        content: text,
                    },
                    author: roleLower,
                    timestamp: ts,
                    time: ts ? { latency: 0 } : undefined,
                    // model info
                    metadata: { model },
                } as any,
            },
            parent: null,
            children: [],
        };
    });

    // second pass: wire parents/children only among kept nodes
    Object.entries(mapping).forEach(([id, nodeData]: [string, any]) => {
        if (!nodes[id]) return;
        const parentId: string | null = nodeData?.parent || null;
        const children: string[] = nodeData?.children || [];
        const filteredChildren = children.filter(cid => !!nodes[cid]);
        nodes[id].children = filteredChildren;
        if (parentId && nodes[parentId]) {
            nodes[id].parent = parentId;
        } else {
            nodes[id].parent = null;
        }
    });

    // build worldLine using chain filtered to kept nodes
    const worldLine = chain.filter(id => !!nodes[id]);
    const rootId = worldLine[0] || null;

    const timestamp = normalizeTimestamp(data?.create_time) || Date.now();
    const updated = normalizeTimestamp(data?.update_time) || timestamp;

    const history: IChatSessionHistoryV2 = {
        schema: 2,
        type: 'history',
        id: `aizex-${data?.conversation_id || timestamp}`,
        title: data?.title || 'Aizex Chat',
        timestamp,
        updated,
        tags: [],
        sysPrompt: undefined,
        modelBareId: undefined,
        customOptions: {},
        nodes,
        rootId,
        worldLine,
    };

    return { name: history.title, history };
}

/**
 * 解析 Cherry Studio 导出的 markdown 文本
 * @param content Cherry Studio 导出的 markdown 文本
 * @returns 解析后的对话内容
 */
const parseCherryStudioMarkdown = (content: string): ParsedChatResult => {
    content = content.trim();
    let title = '对话记录';
    // 检测标题（以 '# ' 开头的行）
    if (content.startsWith('# ')) {
        let lines = content.split('\n');
        title = lines[0].substring(2).trim();
        content = lines.slice(1).join('\n');
    }

    const lines = content.split('\n');
    const messageList: { author: string; content: string }[] = [];
    let currentAuthor = '';
    let currentMessage = '';

    // 遍历 markdown 文本的每一行
    lines.forEach((line) => {
        // 检测用户输入
        if (line.startsWith('### 🧑‍💻 User')) {
            if (currentMessage && currentAuthor) {
                messageList.push({ author: currentAuthor, content: currentMessage.trim() });
            }
            currentAuthor = 'USER';
            currentMessage = '';
        }
        // 检测助手回复
        else if (line.startsWith('### 🤖 Assistant')) {
            if (currentMessage && currentAuthor) {
                messageList.push({ author: currentAuthor, content: currentMessage.trim() });
            }
            currentAuthor = 'ASSISTANT';
            currentMessage = '';
        }
        // 检测分隔符（消息之间的空行）
        else if (line.trim() === '---') {
            // 忽略分隔符，Cherry Studio 使用 --- 作为消息之间的分隔符
        }
        // 累积消息内容
        else {
            currentMessage += line + '\n';
        }
    });

    // 添加最后一条消息（如果有）
    if (currentMessage && currentAuthor) {
        messageList.push({ author: currentAuthor, content: currentMessage.trim() });
    }

    const nodes: Record<string, IChatSessionMsgItemV2> = {};
    const worldLine: string[] = [];
    const timestamp = Date.now();

    messageList.forEach((message, index) => {
        const id = `cherry-${index}`;
        const versionId = `${id}-v1`;
        const roleLower = message.author.toLowerCase();
        nodes[id] = {
            id,
            type: 'message',
            role: roleLower as any,
            currentVersionId: versionId,
            versions: {
                [versionId]: {
                    id: versionId,
                    message: {
                        role: roleLower as any,
                        content: message.content,
                    },
                    author: roleLower,
                    timestamp,
                    time: { latency: 0 },
                } as any,
            },
            parent: index === 0 ? null : worldLine[worldLine.length - 1],
            children: [],
        };
        if (index > 0) {
            const prevId = worldLine[worldLine.length - 1];
            nodes[prevId].children.push(id);
        }
        worldLine.push(id);
    });

    const rootId = worldLine[0] || null;
    const history: IChatSessionHistoryV2 = {
        schema: 2,
        type: 'history',
        id: `cherry-${timestamp}`,
        title: title || 'Cherry Studio Chat',
        timestamp,
        updated: timestamp + 10,
        tags: [],
        sysPrompt: undefined,
        modelBareId: undefined,
        customOptions: {},
        nodes,
        rootId,
        worldLine,
    };
    return { name: history.title, history };
};

export const importChatHistoryFile = async (
    type: 'google-ai-studio' | 'aizex' | 'aizex-claude' | 'aizex-gpt' | 'cherry-studio'
) => {
    let file;
    switch (type) {
        case 'google-ai-studio':
            file = await chooseFileAndParse(parseGoogleAIStudioFile, '');
            break;
        case 'aizex':
        case 'aizex-claude':
        case 'aizex-gpt':
            file = await chooseFileAndParse(parseAizexFile, '.json');
            break;
        case 'cherry-studio':
            file = await chooseFileAndParse(parseCherryStudioMarkdown, '.md');
            break;
    }
    if (!file || !file.succeed) {
        showMessage('解析失败' + file.content, 3000, 'error');
        return;
    };
    if (file.history) {
        const history = file.history;
        if (history.rootId === null || history.worldLine.length === 0) {
            showMessage('解析结果为空', 3000, 'error');
            return;
        }
        // ensure updated > timestamp
        history.updated = Math.max((history.updated || 0), history.timestamp + 10);
        openChatTab(false, history);
        return;
    }
    // fallback for legacy parsers that still return content
    importDialog(file.name, file.content || '');
}
