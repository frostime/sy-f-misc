/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-28 22:15:10
 * @Description  : 
 * @FilePath     : /src/func/gpt/chat/ChatSession/world-tree/index.ts
 * @LastEditTime : 2025-12-28 22:32:13
 */
import { openIframDialog } from "@/func/html-pages/core";
import { ITreeModel } from "../use-tree-model";
import { extractContentText, extractMessageContent } from "@/func/gpt/chat-utils/msg-content";
import { getMessageProp, getPayload } from "@/func/gpt/chat-utils";
import { get } from "http";

interface TreeViewSdk {
    /** 获取树数据 */
    getTreeData: () => Promise<TreeData>;

    /** 切换世界线到指定叶子节点 */
    switchWorldLine: (leafId: string) => void;
}

interface TreeData {
    rootId: string | null;
    worldLine: string[];  // 当前激活的路径 [root, ..., leaf]
    nodes: Record<string, TreeNode>;
}

interface TreeNode {
    id: string;
    type: 'message' | 'separator';
    role: 'user' | 'assistant' | '';
    parent: string | null;
    children: string[];
    preview?: string;      // 内容预览（建议 50 字以内）
    versionCount?: number; // 版本数量
    timestamp?: number;
    author?: string;       // 模型名称
}

const transformNodes = (nodes: Record<string, IChatSessionMsgItemV2>): Record<string, TreeNode> => {
    const result: Record<string, TreeNode> = {};
    Object.entries(nodes).forEach(([id, item]) => {
        let text = '';
        if (item.type === 'message') {
            text = extractContentText(getMessageProp(item, 'content'));
        }
        result[id] = {
            id,
            type: item.type,
            role: item.role as 'user' | 'assistant' | '',
            parent: item.parent,
            children: [...item.children],
            preview: text.slice(0, 100),
            versionCount: item.versions ? Object.keys(item.versions).length : 0,
            timestamp: getPayload(item, 'timestamp'),
            author: getPayload(item, 'author') ?? 'Unknown'
        }
    });
    return result;
}


export const showChatWorldTree = (options: {
    treeModel: ITreeModel,
    width?: string;
    height?: string;
    maxWidth?: string;
    maxHeight?: string;
}) => {
    const defaultSize = {
        width: '1200px',
        height: '800px',
        maxHeight: '90%',
        maxWidth: '90%'
    }

    const treeModel = options.treeModel;

    const size = { ...defaultSize, ...options };

    const dialog = openIframDialog({
        title: 'Chat Tree',
        width: size.width!,
        height: size.height!,
        maxWidth: size.maxWidth!,
        maxHeight: size.maxHeight!,
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/chat-world-tree.html',
            inject: {
                presetSdk: true,
                siyuanCss: true,
                customSdk: {
                    getTreeData: async () => {
                        return {
                            rootId: treeModel.getRootId(),
                            worldLine: treeModel.getWorldLine(),
                            nodes: transformNodes(treeModel.getNodes())
                        };
                    },
                    switchWorldLine: (leafId: string) => {
                        treeModel.switchWorldLine(leafId);
                        // 关闭对话框或更新显示
                        dialog.close();
                    }
                }
            }
        }
    });

}