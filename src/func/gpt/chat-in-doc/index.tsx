/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-10
 * @FilePath     : /src/func/gpt/chat-in-doc/index.tsx
 * @Description  : 文档内对话功能
 */

import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { Protyle } from "siyuan";
import { openChatInDocWindow } from "./floating-chat";
import { blankMessage, SECTION_ATTR } from "./document-parser";

// 模块状态
let enabled = false;

/**
 * 初始化文档内对话功能
 */
export const init = () => {
    if (enabled) return;
    enabled = true;

    const plugin = thisPlugin();

    // 注册Slash命令
    plugin.addProtyleSlash({
        id: "chat-in-doc",
        filter: ["chat-in-doc", "chat", "对话"],
        html: "在文档中插入对话",
        //@ts-ignore
        callback: (protyle: Protyle, nodeElement?: HTMLElement) => {
            if (nodeElement && nodeElement.closest(`[${SECTION_ATTR}="USER"]`)) {
                protyle.insert(window.Lute.Caret, false, false);
            } else {
                let md = blankMessage('USER', '', true);
                protyle.insert(md, true);
            }
            // 打开浮动窗口
            openChatInDocWindow();
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
};
