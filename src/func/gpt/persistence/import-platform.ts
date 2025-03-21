/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 14:55:08
 * @FilePath     : /src/func/gpt/persistence/import-platform.ts
 * @LastEditTime : 2025-03-21 15:02:30
 * @Description  : 
 */
import { showMessage } from "siyuan";
import { ensureRootDocument, formatSingleItem } from "./sy-doc";
import { formatDateTime, getNotebook, html2ele, simpleDialog } from "@frostime/siyuan-plugin-kits";
import { createDocWithMd } from "@frostime/siyuan-plugin-kits/api";


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
    </div>
    <textarea class="b3-text-field fn__block" style="font-size: 18px; resize: none; flex: 1;" spellcheck="false">${markdown}</textarea>
    </div>
    `;
    const ele = html2ele(html);

    const download = () => {
        let text = ele.querySelector('textarea')?.value;
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
function importGoogleAIStudioFile(): Promise<{ succeed: boolean, name: string, content: string }> {
    return new Promise((resolve) => {
        // 创建文件选择输入框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '';

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
                    const content = event.target.result as string;
                    const prompts = JSON.parse(content);

                    // 生成 Markdown 文本
                    let markdownText = '';
                    if (prompts.systemInstruction) {
                        markdownText += `> ---\n> <SYSTEM/>\n`;
                        markdownText += `\`\`\`json\n${JSON.stringify(prompts.systemInstruction, null, 2)}\n\`\`\`\n\n`;
                    }
                    // markdownText += `> model: ${prompts.runSettings.model}\n\n`;

                    const chunks = prompts.chunkedPrompt.chunks;
                    chunks.forEach((chunk, index) => {
                        if (chunk.text) {
                            let role = chunk.role;
                            if (role === 'model') {
                                role = 'ASSISTANT';
                            } else if (role === 'user') {
                                role = 'USER';
                            } else if (role === 'system') {
                                role = 'SYSTEM';
                            }
                            const attr = { index: index.toString() };
                            if (role === 'ASSISTANT') {
                                attr['model'] = prompts.runSettings.model;
                            }
                            const item = formatSingleItem(role, chunk.text, attr);
                            markdownText += item + '\n\n';
                        }
                    });

                    // 返回成功结果
                    resolve({ succeed: true, name: file.name, content: markdownText });
                } catch (error) {
                    // 返回失败结果
                    resolve({ succeed: false, name: file.name, content: 'Error parsing file' });
                }
            };

            reader.onerror = function (error) {
                resolve({ succeed: false, name: file.name, content: 'Error reading file' });
            };

            reader.readAsText(file, 'UTF-8');
        };

        // 触发文件选择
        fileInput.click();
    });
}

export const importGoogleAIStudio = async () => {
    const file = await importGoogleAIStudioFile();
    if (!file.succeed) {
        showMessage('解析失败', 3000, 'error');
        return;
    };
    importDialog(file.name, file.content);
}
