/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-28 22:15:10
 * @Description  :
 * @FilePath     : /src/func/gpt/chat/ChatSession/world-tree/index.ts
 * @LastEditTime : 2025-12-29 22:23:58
 */
import { openIframeDialog } from "@/func/html-pages/core";
import { ITreeModel } from "../use-tree-model";
import { extractContentText } from "@/func/gpt/chat-utils/msg-content";
import { getMessageProp, getPayload } from "@/func/gpt/chat-utils";


/*
interface TreeViewSdk {
    getTreeData: () => Promise<TreeData>;
    getFullContent: (nodeId: string) => Promise<string>;
    switchWorldLine: (leafId: string) => void;
}

interface TreeData {
    rootId: string | null;
    worldLine: string[];
    nodes: Record<string, TreeNode>;
}
*/
interface TreeNode {
    id: string;
    type: 'message' | 'separator';
    role: 'user' | 'assistant' | '';
    parent: string | null;
    children: string[];
    preview?: string;      // 内容预览（200 字以内，供详情面板展示）
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
            preview: text.slice(0, 200),
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

    const dialog = openIframeDialog({
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
                    getFullContent: async (nodeId: string) => {
                        const nodes = treeModel.getNodes();
                        const item = nodes[nodeId];
                        if (!item || item.type !== 'message') return '';
                        return extractContentText(getMessageProp(item, 'content'));
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
