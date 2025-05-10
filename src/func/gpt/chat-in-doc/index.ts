/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-10
 * @FilePath     : /src/func/gpt/chat-in-doc/index.ts
 * @Description  : 文档内对话功能
 */

import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { Protyle, showMessage } from "siyuan";
import { openChatInDocWindow } from "./floating-chat";
import { blankMessage, SECTION_ATTR } from "./document-parser";
import { insertBlock, appendBlock } from "@frostime/siyuan-plugin-kits/api";

// 模块状态
let enabled = false;

// 超级块属性名
const AREA_ATTR = 'custom-chat-indoc-area';

/**
 * 创建超级块内容
 */
const superBlock = (content: string) => {
    const timestamp = Date.now();
    return `{{{row

${content}

}}}
{: ${AREA_ATTR}="chat-${timestamp}" style="outline: 1px solid var(--b3-border-color);" }
`.trim();
};

/**
 * 检查节点是否在超级块内
 */
const findSuperblock = (nodeElement?: HTMLElement): BlockId | undefined => {
    if (!nodeElement) return undefined;

    const superblockElement = nodeElement.closest(`[${AREA_ATTR}]`);
    return superblockElement ? superblockElement.getAttribute('data-node-id') : undefined;
};

/**
 * 创建新的聊天超级块
 * @param docId 文档ID
 * @param nodeId 节点ID，可选，如果提供则在该节点后插入
 * @returns 超级块ID
 */
const createChatSuperblock = async (docId: DocumentId, nodeId?: BlockId): Promise<BlockId> => {
    try {
        let md = blankMessage('USER', '');
        // 创建超级块内容
        const content = superBlock(md);

        // 确定插入位置
        let result: any;
        if (nodeId) {
            // 如果指定了节点，则在该节点后插入
            result = await insertBlock('markdown', content, undefined, nodeId);
        } else {
            // 否则添加到文档末尾
            result = await appendBlock('markdown', content, docId);
        }

        return result[0].doOperations[0].id;
    } catch (error) {
        console.error("创建超级块失败", error);
        throw error;
    }
};

/**
 * 初始化文档内对话功能
 */
export const init = () => {
    if (enabled) return;
    enabled = true;

    const plugin = thisPlugin();

    // 注册普通模式Slash命令
    plugin.addProtyleSlash({
        id: "chat-in-doc",
        filter: ["chat-in-doc", "chat", "对话"],
        html: "文档内 AI 对话",
        //@ts-ignore
        callback: async (protyle: Protyle, nodeElement?: HTMLElement) => {
            const rootId = protyle.protyle.block.rootID;

            // 检查是否在超级块内
            const existingSuperblockId = findSuperblock(nodeElement);

            if (existingSuperblockId) {
                // 如果在超级块内，自动切换到mini模式
                console.log("检测到在超级块内，自动切换到mini模式");
                openChatInDocWindow(rootId, existingSuperblockId);
                return;
            }

            // 普通模式处理
            if (nodeElement && nodeElement.closest(`[${SECTION_ATTR}="USER"]`)) {
                protyle.insert(window.Lute.Caret, false, false);
            } else {
                let md = blankMessage('USER', '', true);
                protyle.insert(md, true);
            }

            // 打开浮动窗口
            openChatInDocWindow(rootId);
        }
    });

    // 注册Mini版Slash命令
    plugin.addProtyleSlash({
        id: "chat-in-doc-mini",
        filter: ["chat-in-doc-mini", "chat-mini", "对话-mini"],
        html: "文档内 AI 对话 (Mini版)",
        //@ts-ignore
        callback: async (protyle: Protyle, nodeElement?: HTMLElement) => {
            const rootId = protyle.protyle.block.rootID;
            protyle.insert(window.Lute.Caret, false, false);

            // 获取当前节点ID
            const nodeId = nodeElement?.getAttribute('data-node-id');

            // 检查是否在超级块内
            const existingSuperblockId = findSuperblock(nodeElement);

            try {
                let superblockId: string;

                if (existingSuperblockId) {
                    // 如果已经在超级块中，直接使用该超级块
                    superblockId = existingSuperblockId;
                } else {
                    // 否则创建新的超级块
                    superblockId = await createChatSuperblock(rootId, nodeId);
                }

                const ele = document.querySelector(`[data-node-id="${superblockId}"]`) as HTMLElement;
                if (ele) {
                    protyle.focusBlock(ele);
                }

                // 打开对话窗口，传入超级块ID作为containerId
                openChatInDocWindow(rootId, superblockId);
            } catch (error) {
                console.error("初始化Mini对话失败", error);
                showMessage("初始化Mini对话失败");
            }
        }
    });
};

/**
 * 清理文档内对话功能
 */
export const destroy = () => {
    if (!enabled) return;
    enabled = false;

    const plugin = thisPlugin();
    plugin.delProtyleSlash("chat-in-doc");
    plugin.delProtyleSlash("chat-in-doc-mini");
};
