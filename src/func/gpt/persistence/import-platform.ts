/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 14:55:08
 * @FilePath     : /src/func/gpt/persistence/import-platform.ts
 * @LastEditTime : 2025-07-30 16:24:15
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

/**
 * 导入谷歌 AI Studio 的对话文件
 */
// async function importGoogleAIStudioFile(): Promise<ImportFileResult> {
//     return new Promise((resolve) => {
//         // 创建文件选择输入框
//         const fileInput = document.createElement('input');
//         fileInput.type = 'file';
//         fileInput.accept = '';

//         // 监听文件选择事件
//         fileInput.onchange = function (event: Event) {
//             const file = (event.target as HTMLInputElement).files?.[0];
//             if (!file) {
//                 resolve({ succeed: false, name: '', content: 'No file selected.' });
//                 return;
//             }

//             // 读取文件内容
//             const reader = new FileReader();
//             reader.onload = function (event) {
//                 try {
//                     const content = event.target.result as string;
//                     const prompts = JSON.parse(content);

//                     // 生成 Markdown 文本
//                     let markdownText = '';
//                     if (prompts.systemInstruction) {
//                         markdownText += `> ---\n> <SYSTEM/>\n`;
//                         markdownText += `\`\`\`json\n${JSON.stringify(prompts.systemInstruction, null, 2)}\n\`\`\`\n\n`;
//                     }
//                     // markdownText += `> model: ${prompts.runSettings.model}\n\n`;

//                     const chunks = prompts.chunkedPrompt.chunks;
//                     chunks.forEach((chunk, index) => {
//                         if (chunk.text) {
//                             let role = chunk.role;
//                             if (role === 'model') {
//                                 role = 'ASSISTANT';
//                             } else if (role === 'user') {
//                                 role = 'USER';
//                             } else if (role === 'system') {
//                                 role = 'SYSTEM';
//                             }
//                             const attr = { index: index.toString() };
//                             if (role === 'ASSISTANT') {
//                                 attr['model'] = prompts.runSettings.model;
//                             }
//                             const item = formatSingleItem(role, chunk.text, attr);
//                             markdownText += item + '\n\n';
//                         }
//                     });

//                     // 返回成功结果
//                     resolve({ succeed: true, name: file.name, content: markdownText });
//                 } catch (error) {
//                     // 返回失败结果
//                     resolve({ succeed: false, name: file.name, content: 'Error parsing file' });
//                 }
//             };

//             reader.onerror = function (error) {
//                 resolve({ succeed: false, name: file.name, content: 'Error reading file' });
//             };

//             reader.readAsText(file, 'UTF-8');
//         };

//         // 触发文件选择
//         fileInput.click();
//     });
// }


const chooseFileAndParse = async (parser: (text: string) => { name?: string; content: string }, filter: string = '') => {
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
                        resolve({ succeed: true, name: result?.name || file.name, content: result.content });
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


const parseGoogleAIStudioFile = (content: string): { name: string; content: string } => {
    const prompts = JSON.parse(content);

    // 生成 Markdown 文本
    let markdownText = '';
    if (prompts.systemInstruction?.text) {
        markdownText += `> ---\n> <SYSTEM/>\n`;
        markdownText += `${prompts.systemInstruction.text}\n\n`;
    }
    // markdownText += `> model: ${prompts.runSettings.model}\n\n`;

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
                return
            }
            const attr = { index: index.toString() };
            if (role === 'ASSISTANT') {
                attr['model'] = prompts.runSettings.model;
            }
            const item = formatSingleItem(role, chunk.text, attr);
            markdownText += item + '\n\n';
        }
    });
    return { name: 'chat', content: markdownText };
}

function parseAizexClaudeFile(content: string): { name: string; content: string } {
    const prompts = JSON.parse(content);
    let name = prompts.name;
    let messages = prompts.chat_messages;
    let markdownText = '';
    const senderMap = {
        human: 'USER',
        assistant: 'ASSISTANT',
    }
    messages.forEach((message, index) => {
        const sender = senderMap[message.sender];
        const content = message.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
        const attr = { index: index.toString() };
        if (sender === 'ASSISTANT') {
            attr['model'] = 'Claude';
        }
        const item = formatSingleItem(sender, content, attr);
        markdownText += item + '\n\n';
    });
    return { name, content: markdownText };
}

const parseAizexGPTFile = (content: string): { name: string; content: string } => {
    const jsonData = JSON.parse(content);
    let name = jsonData.title;
    let mapping = jsonData.mapping;
    // Create an array to hold all messages
    let messages = [];

    for (let key in mapping) {
        let message = mapping[key].message;
        if (!message) continue;
        const author = message.author?.role;
        if (author === 'tool' || !author) continue;
        let messageContent = message.content.parts.join('\n\n');
        let createTime = message.create_time as number;
        let model = message.metadata?.model_slug;
        messages.push({
            author,
            content: messageContent,
            timestamp: createTime,
            model
        });
    }

    messages.sort((a, b) => a.timestamp - b.timestamp);
    let markdownText = '';
    messages.forEach((message, index) => {
        const attr = { index: index.toString(), timestamp: formatDateTime(null, new Date(message.timestamp * 1000)) };
        if (message.model) {
            attr['model'] = message.model;
        }
        const item = formatSingleItem(message.author.toUpperCase(), message.content, attr);
        markdownText += item + '\n\n';
    });
    return { name, content: markdownText };

}

/**
 * 解析 Cherry Studio 导出的 markdown 文本
 * @param content Cherry Studio 导出的 markdown 文本
 * @returns 解析后的对话内容
 */
const parseCherryStudioMarkdown = (content: string): { name: string; content: string } => {

    content = content.trim();
    let title = '对话记录'
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

    // 将解析后的消息转换为 SiYuan 格式
    let markdownText = '';
    for (let i = 0; i < messageList.length; i++) {
        const message = messageList[i];
        const attr = { index: i.toString() };
        const item = formatSingleItem(message.author, message.content, attr);
        markdownText += item + '\n\n';
    }

    return { name: title || 'Cherry Studio Chat', content: markdownText };
};

export const importChatHistoryFile = async (
    type: 'google-ai-studio' | 'aizex-claude' | 'aizex-gpt' | 'cherry-studio'
) => {
    let file;
    switch (type) {
        case 'google-ai-studio':
            file = await chooseFileAndParse(parseGoogleAIStudioFile, '');
            break;
        case 'aizex-claude':
            file = await chooseFileAndParse(parseAizexClaudeFile, '.json');
            break;
        case 'aizex-gpt':
            file = await chooseFileAndParse(parseAizexGPTFile, '.json');
            break;
        case 'cherry-studio':
            file = await chooseFileAndParse(parseCherryStudioMarkdown, '.md');
            break;
    }
    if (!file || !file.succeed) {
        showMessage('解析失败' + file.content, 3000, 'error');
        return;
    };
    importDialog(file.name, file.content);
}
