/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 14:55:08
 * @FilePath     : /src/func/gpt/persistence/import-platform.ts
 * @LastEditTime : 2025-01-01 16:11:26
 * @Description  : 
 */
import { showMessage } from "siyuan";
import { ensureRootDocument } from "./sy-doc";
import { formatDateTime, getNotebook } from "@frostime/siyuan-plugin-kits";
import { createDocWithMd } from "@frostime/siyuan-plugin-kits/api";


const exportDoc = async (title: string, rootDoc: Block, content: string) => {
    title = formatDateTime('yyyy-MM-dd', new Date()) + ' ' + title;
    let path = rootDoc.hpath;
    await createDocWithMd(rootDoc.box, `${path}/${title}`, content);
    showMessage(`保存到 ${getNotebook(rootDoc.box).name}${path}/${title}`);
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
                        markdownText += `## 系统指令\n\n`;
                        markdownText += `\`\`\`\n${JSON.stringify(prompts.systemInstruction, null, 2)}\n\`\`\`\n\n`;
                    }
                    markdownText += `> model: ${prompts.runSettings.model}\n\n`;

                    const chunks = prompts.chunkedPrompt.chunks;
                    chunks.forEach((chunk, index) => {
                        if (chunk.text) {
                            markdownText += `## ${index + 1}. ${chunk.role}\n\n`;
                            markdownText += `${chunk.text}\n\n`;
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
    let rootDoc = await ensureRootDocument('导出对话文档');
    if (!rootDoc) {
        showMessage('创建导出文档位置失败', 3000, 'error');
        return;
    }
    await exportDoc(file.name, rootDoc, file.content);
}
