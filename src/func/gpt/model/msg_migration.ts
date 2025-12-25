// src/func/gpt/model/msg_migration.ts

function migrateSessionToV2(v1: IChatSessionHistory): IChatSessionHistoryV2 {
    const nodes: Record<ItemID, IChatSessionMsgItemV2> = {};
    const worldLine: ItemID[] = [];
    let prevId: ItemID | null = null;

    for (const item of v1.items) {
        const itemId = item.id;

        // 1. 兼容旧数据的拼写错误
        const nodeType = (item.type as string) === 'seperator' ? 'separator' : item.type;

        // 2. 构建 Versions
        const versions: Record<string, IMessageVersionV2> = {};
        let currentVersionId = '';

        // 仅 Message 类型需要构建 Version
        if (nodeType === 'message') {
            if (item.versions && Object.keys(item.versions).length > 0) {
                // Case A: V1 已经是多版本结构 (V1 后期特性)
                for (const [verId, ver] of Object.entries(item.versions)) {
                    // 修正：确保 verId 存在，如果旧数据 key 有问题，重新生成
                    const validVerId = verId || generateId();
                    const isCurrent = validVerId === item.currentVersion;

                    versions[validVerId] = {
                        id: validVerId,
                        message: {
                            role: item.message?.role ?? 'user', // 默认 fallback
                            content: ver.content,
                            reasoning_content: ver.reasoning_content,
                            tool_calls: item.message?.tool_calls, // 工具调用通常共享
                            tool_call_id: item.message?.tool_call_id,
                            name: item.message?.name,
                            refusal: item.message?.refusal,
                        },
                        author: ver.author ?? item.author,
                        timestamp: ver.timestamp ?? item.timestamp,
                        token: ver.token ?? (isCurrent ? item.token : undefined),
                        time: ver.time ?? (isCurrent ? item.time : undefined),
                        userPromptSlice: item.userPromptSlice, // User Slice 通常共享
                        usage: isCurrent ? item.usage : undefined,
                        toolChainResult: isCurrent ? item.toolChainResult : undefined,
                    };
                }
                currentVersionId = item.currentVersion ?? Object.keys(versions)[0];
            } else if (item.message) {
                // Case B: V1 普通单消息
                // 必须生成一个新的 version ID
                const verId = 'v_' + generateId();
                versions[verId] = {
                    id: verId,
                    message: { ...item.message }, // 浅拷贝即可
                    author: item.author,
                    timestamp: item.timestamp,
                    token: item.token,
                    usage: item.usage,
                    time: item.time,
                    userPromptSlice: item.userPromptSlice,
                    toolChainResult: item.toolChainResult,
                };
                currentVersionId = verId;
            }
        }
        // Case C: Separator -> versions={}, currentVersionId=''

        // 3. 构建 V2 Node
        const v2Node: IChatSessionMsgItemV2 = {
            id: itemId,
            type: nodeType as any,

            // role 在 separator 时可能为 undefined，这是符合定义的
            role: item.message?.role,
            name: item.message?.name,

            currentVersionId,
            versions,

            parent: prevId,
            children: [], // 初始化为空，稍后填充

            context: item.context,
            multiModalAttachments: item.multiModalAttachments,

            // 状态标记迁移
            hidden: item.hidden,
            pinned: item.pinned,
            // loading 状态在迁移历史记录时通常置为 false，避免打开旧会话还在转圈
            loading: false,

            attachedItems: item.attachedItems,
            attachedChars: item.attachedChars,
        };

        nodes[itemId] = v2Node;
        worldLine.push(itemId);

        // 4. 建立父子关联 (双向链表)
        if (prevId && nodes[prevId]) {
            nodes[prevId].children.push(itemId);
        }

        prevId = itemId;
    }

    // 5. 返回完整 V2 结构
    return {
        schema: 2,
        type: 'history',
        id: v1.id,
        title: v1.title,
        timestamp: v1.timestamp,
        updated: v1.updated,
        tags: v1.tags,
        sysPrompt: v1.sysPrompt,

        // 保留旧的自定义选项，防止丢失 branchFrom 等元数据
        customOptions: v1.customOptions,

        modelBareId: undefined, // 需要外部逻辑根据 V1 provider 设置，或者留空等待用户选择

        nodes,
        rootId: worldLine[0] ?? null,
        worldLine,
        // migration 后的书签可以为空，或者把最后一个节点设为 bookmark
        bookmarks: [],
    };
}

// 简单的 ID 生成器，建议确保不重复
function generateId(): string {
    return window.Lute.NewNodeID();
}
