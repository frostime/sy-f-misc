/**
 * @future 未来会进行迁移
 * 引入 Tree 结构来管理对话消息节点
 * 
 * IChatSessionMsgItem --> IChatSessionMsgItemV2
 * IChatSessionHistory --> IChatSessionHistoryV2
 * 
 * ====
1. rerun 不产生分支，而产生 version；可以想象这样一个情况：对一个我问题，我想要听GPT Claude Gemini 多个人的意见——所以会在一个 item 上出现多个 version; 后面我可能想要问不同类型的问题，我可以手动 branch 一个 item 在下方产生不同的世界线（用平行世界来比喻，很像）
2. 目前不做 version 和 branch 的关联绑定，是因为做了的话处理逻辑会很复杂
3. sperator：如果一个消息在 sperator 之后那么他的历史消息只会到 seperator 未知；本质就是一个放在 chat session 中的 new chat 功能；有些情况下我想要另开对话，可以用他从逻辑上清空记录，但是 UI 上依然能看到之前前面的消息
4. pin 是指：不管我们对话的 sliding window size 多大，不过是否有 seperator ，一律加入对话中，有些我们认为很重要的信息，就可以 pin 在对话流随
5. item 没有 title，那是一个错误
6. loading 是 streaming 过程中纯 UI 状态

如果想要深入，可以参考 repo https://github.com/frostime/sy-f-misc/blob/main/src/func/gpt/
 */
type ItemID = string;

/**
 * 单个版本的完整数据
 * 
 * - 同一问题的不同模型回答（GPT/Claude/Gemini）
 * - rerun 产生的新回复
 */
interface IMessagePayload {
    id: string;
    message: IMessageLoose;
    // content: TMessageContent;
    // reasoning_content?: string;

    // 元数据
    author?: string;      // 模型名称 或 'user'
    timestamp?: number;

    // Token 与耗时
    token?: number;
    usage?: ICompletionUsage;
    time?: { latency: number; throughput?: number };

    // 用户输入的 prompt slice（每次编辑可能不同）
    userPromptSlice?: [number, number];

    // tool_call_id?: string;  // role === 'tool' 时必需
    // refusal?: string | null;
    // tool_calls?: IToolCall[];
    // 工具调用结果（每次 rerun 结果可能不同）
    toolChainResult?: IChatSessionMsgItem['toolChainResult'];
}

/**
 * 对话节点
 */
interface IChatSessionMsgItemV2 {
    id: ItemID;
    // WARN 注意 V1 里面为 seperator ，拼写错误
    /** 
     * message: 正常消息节点
     * separator: 上下文断点（versions 为空对象，currentVersionId 为空字符串）
     */
    type: 'message' | 'separator';

    name?: string;
    role?: 'user' | 'assistant' | 'system' | 'tool';

    // ===== 版本管理 =====
    currentVersionId: string;  // seperator 时为 ''
    versions: Record<string, IMessagePayload>;

    // ===== 树形结构 =====
    parent: ItemID | null;
    children: ItemID[];

    // ===== 附加内容（不随版本变化） =====
    context?: IProvidedContext[];
    multiModalAttachments?: TMessageContentPart[];

    // ===== 节点状态标记 =====
    hidden?: boolean;   // 构建上下文时跳过
    pinned?: boolean;   // 无视 sliding window 和 separator，强制包含
    loading?: boolean; // 正在生成中, 对持久化无影响，仅仅为了 UI 响应式而设置

    // ===== 运行时统计（持久化可选） =====
    attachedItems?: number;
    attachedChars?: number;

    // ===== 废弃 =====
    // 仅仅为了向后兼容而保留
    branchFrom?: {
        sessionId: string;
        sessionTitle: string;
        messageId: string;
    };
    branchTo?: {
        sessionId: string;
        sessionTitle: string;
        messageId: string;
    }[];
}

/**
 * 会话历史 V2
 */
interface IChatSessionHistoryV2 {
    schema: 2;
    type: 'history';

    id: string;
    title: string;
    timestamp: number;   // 创建时间
    updated?: number;    // 最后更新时间
    tags?: string[];

    sysPrompt?: string;
    modelBareId?: ModelBareId;
    customOptions?: Record<string, any>;

    // ===== 树形存储 =====
    nodes: Record<ItemID, IChatSessionMsgItemV2>;
    rootId: ItemID | null;    // null 表示空会话
    worldLine: ItemID[];      // 当前活跃路径 [root, ..., leaf]

    // Leaf 节点列表, 方便定位不同 thread
    bookmarks?: ItemID[];
}
