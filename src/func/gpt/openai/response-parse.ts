// ============================================================================
// 协议响应解析层（OpenAI / Claude / Gemini）
// ============================================================================
// 本模块刻意保持零依赖（不 import 任何 SiYuan / adapter / store 模块），因此可以
// 在 node 离线编译并单测（tests/gpt-protocol-*.ts，网络边界用假 Response mock）。
//
// 职责：
//   1. SSE 事件切分：任意网络分片、CRLF、多 data: 行、末尾无换行的事件。
//      多字节 UTF-8 字符由上层 TextDecoderStream（流式解码）处理。
//   2. usage 归一化：只保留提供方实际上报的字段，缺失值保持 undefined（不伪造 0）；
//      Claude 相加式缓存计数折算进 prompt_tokens，Gemini 思考计数折算进 completion_tokens，
//      使归一化输出统一满足「cached/reasoning 均为对应 basic count 的子集」。
//      原始 usage 保留在 providerMeta.claudeUsage / providerMeta.geminiUsage。
//   3. reasoning 归一化：reasoning_content / reasoning 字符串、结构化 reasoning_details
//      （只取 text/summary 文本，忽略 encrypted/signature，绝不 JSON.stringify 任意对象）、
//      Claude thinking 块、Gemini part.thought、以及 OpenAI 兼容 API 的前缀 <think>...</think> 分区。
//   4. 流式回调契约 streamMsg(msg, toolCalls?, snapshot?)：
//      - msg：旧版第一参，推理仍以 <think>...</think> 包裹（向后兼容）；
//      - snapshot（新第三参）：{ content, reasoning_content, usage }，正文/思维链分离的
//        纯文本与当前 usage，每种协议在每个有效事件上都会发出（思维链在正文出现前就开始流式）。

/** streamMsg 第三参快照类型；与 ICompletionResult 的 content/reasoning_content/usage 同构 */
export type TStreamSnapshot = Pick<ICompletionResult, 'content' | 'reasoning_content' | 'usage'>;

/**
 * 流式进度回调。
 * - msg：旧版第一参，推理仍以 <think>...</think> 包裹（向后兼容）；
 * - toolCalls: 截至当前已合并的流式工具调用（可能不完整）
 * - snapshot: 分离后的纯文本 content / reasoning_content 与当前 usage
 */
export type TStreamMsgCallback = (
    msg: string,
    toolCalls?: IToolCallResponse[],
    snapshot?: TStreamSnapshot
) => void;

export interface TProtocolStreamHooks {
    streamMsg?: TStreamMsgCallback;
    abortController?: AbortController;
    /** MessageLogger 等旁路观察：每个解析出的 SSE 事件 payload */
    onRawEvent?: (data: any) => void;
    /** 请求发出时刻（ms），用于计算 latency/throughput */
    t0?: number;
}

/** 引用/citation 的结构化形状（与 adapter.TReference 兼容，避免引入重依赖） */
export type TResponseReference = { title?: string; url: string };

// ============================================================================
// 基础工具
// ============================================================================

export const parseJsonSafe = <T = any>(text: string, fallback: T = null as T): T => {
    try {
        return JSON.parse(text) as T;
    } catch {
        return fallback;
    }
};

/** 有效的 token 计数：有限非负数字；负值视为提供方给出的无效值 → 按未上报处理 */
const isNumeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

const joinNonEmpty = (parts: (string | undefined)[], sep = '\n\n'): string | undefined => {
    const joined = parts.filter(p => p).join(sep);
    return joined || undefined;
};

/** 深度合并 usage 原始字段（流式期间字段分批到达；null/undefined 视为「未上报」跳过） */
const mergeRawUsage = (target: Record<string, any>, next: Record<string, any> | null | undefined) => {
    if (!next || typeof next !== 'object') return target;
    for (const [key, value] of Object.entries(next)) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'object' && !Array.isArray(value) &&
            typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])) {
            target[key] = mergeRawUsage({ ...target[key] }, value);
        } else {
            target[key] = value;
        }
    }
    return target;
};

/** 只保留值为数字的字段（保证 ICompletionUsageDetails 的类型诚实性） */
const pickNumericDetails = (raw: any): ICompletionUsageDetails | undefined => {
    if (!raw || typeof raw !== 'object') return undefined;
    const details: ICompletionUsageDetails = {};
    for (const [key, value] of Object.entries(raw)) {
        if (isNumeric(value)) details[key] = value;
    }
    return Object.keys(details).length > 0 ? details : undefined;
};

// ============================================================================
// SSE 事件切分
// ============================================================================

export interface TSseParser {
    /** 喂入一段解码后的文本（任意边界切分都安全） */
    push(chunk: string): void;
    /** 流结束时调用：处理缓冲中最后一个没有空行结尾的事件 */
    flush(): void;
}

/**
 * 按 SSE 规范切分事件（事件之间以空行分隔；`data:` 行可多条，按规范用 '\n' 连接）。
 * 兼容 '\n' 与 '\r\n' 行尾（含跨分片的 '\r' + '\n'），支持事件末尾无空行。
 */
export const createSseParser = (onEvent: (data: string) => void): TSseParser => {
    let buffer = '';

    const emitEvent = (eventText: string) => {
        const dataLines: string[] = [];
        for (const rawLine of eventText.split('\n')) {
            const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
            if (line.startsWith(':')) continue; // SSE 注释/心跳
            if (line.startsWith('data:')) {
                const value = line.slice(5);
                dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
            }
            // event:/id:/retry: 等字段与协议分发无关（Claude 按 payload.type 分发），忽略
        }
        if (dataLines.length > 0) {
            onEvent(dataLines.join('\n'));
        }
    };

    /** 扫描 buffer，切出所有「空行结尾」的完整事件 */
    const processBuffer = (final: boolean) => {
        let start = 0;
        let i = 0;
        const nlLen = (idx: number): number => {
            if (buffer[idx] === '\r' && buffer[idx + 1] === '\n') return 2;
            if (buffer[idx] === '\n' || buffer[idx] === '\r') return 1;
            return 0;
        };
        while (i < buffer.length) {
            const first = nlLen(i);
            if (first === 0) { i++; continue; }
            const second = nlLen(i + first);
            if (second === 0) { i += first; continue; }
            emitEvent(buffer.slice(start, i));
            i = start = i + first + second;
        }
        buffer = buffer.slice(start);
        if (final && buffer.trim()) {
            emitEvent(buffer);
            buffer = '';
        }
    };

    return {
        push(chunk: string) {
            buffer += chunk;
            processBuffer(false);
        },
        flush() {
            processBuffer(true);
        },
    };
};

// ============================================================================
// usage 归一化
// ============================================================================

/**
 * OpenAI 兼容 Chat Completions usage（官方 SDK CompletionUsage 形状）。
 * 基本计数与 prompt_tokens_details / completion_tokens_details 原样保留（仅保留有效数字字段）。
 * 文档化别名归一（仅在目标字段未上报时填充，原始键保留）：
 * - OpenAI 官方 prompt_tokens_details.cache_write_tokens → cache_creation_tokens；
 * - DeepSeek 顶层 prompt_cache_hit_tokens（官方文档：与 prompt_tokens_details.cached_tokens 同值）
 *   与 prompt_cache_miss_tokens（未命中缓存的 prompt token）→ uncached_tokens。
 */
export const normalizeOpenAIUsage = (raw: any): ICompletionUsage | null => {
    if (!raw || typeof raw !== 'object') return null;
    const usage: ICompletionUsage = {};
    if (isNumeric(raw.prompt_tokens)) usage.prompt_tokens = raw.prompt_tokens;
    if (isNumeric(raw.completion_tokens)) usage.completion_tokens = raw.completion_tokens;
    if (isNumeric(raw.total_tokens)) usage.total_tokens = raw.total_tokens;

    const promptDetails: ICompletionUsageDetails = pickNumericDetails(raw.prompt_tokens_details) ?? {};
    if (!isNumeric(promptDetails.cache_creation_tokens) && isNumeric(raw.prompt_tokens_details?.cache_write_tokens)) {
        promptDetails.cache_creation_tokens = raw.prompt_tokens_details.cache_write_tokens;
    }
    if (!isNumeric(promptDetails.cached_tokens) && isNumeric(raw.prompt_cache_hit_tokens)) {
        promptDetails.cached_tokens = raw.prompt_cache_hit_tokens;
    }
    if (isNumeric(raw.prompt_cache_miss_tokens)) {
        promptDetails.uncached_tokens = raw.prompt_cache_miss_tokens;
    }
    if (Object.keys(promptDetails).length > 0) usage.prompt_tokens_details = promptDetails;

    const completionDetails = pickNumericDetails(raw.completion_tokens_details);
    if (completionDetails) usage.completion_tokens_details = completionDetails;
    return Object.keys(usage).length > 0 ? usage : null;
};

/**
 * Claude Messages usage → 归一化 usage。
 * Claude 原始语义是相加的：total input = input_tokens + cache_read + cache_creation（官方 SDK 注释）。
 * 归一化时把已上报的 cache 计数折算进 prompt_tokens，使 cached_tokens / cache_creation_tokens
 * 与 OpenAI/Gemini 一样成为 prompt_tokens 的子集；原始相加计数保留在 providerMeta.claudeUsage。
 * 约束：
 * - prompt_tokens 只在 input_tokens 已知时归一化：input 未知时不得用 cache-only 数据
 *   把 prompt 伪装成「只有缓存子集」，缺失的 cache 计数在 input 已知时按相加语义的零贡献处理；
 * - total_tokens 只在 prompt 与 completion 都已归一化时推算；
 * - 已上报的明细始终保留，即使输入总量未知；不能用明细冒充总量。
 */
export const normalizeClaudeUsage = (raw: any): ICompletionUsage | null => {
    if (!raw || typeof raw !== 'object') return null;
    const usage: ICompletionUsage = {};
    const inputKnown = isNumeric(raw.input_tokens);
    const outputKnown = isNumeric(raw.output_tokens);
    const input = inputKnown ? raw.input_tokens : 0;
    const output = outputKnown ? raw.output_tokens : 0;
    const cacheRead = isNumeric(raw.cache_read_input_tokens) ? raw.cache_read_input_tokens : 0;
    const cacheCreation = isNumeric(raw.cache_creation_input_tokens) ? raw.cache_creation_input_tokens : 0;

    if (inputKnown) usage.prompt_tokens = input + cacheRead + cacheCreation;
    const promptDetails: ICompletionUsageDetails = {};
    if (isNumeric(raw.cache_read_input_tokens)) promptDetails.cached_tokens = cacheRead;
    if (isNumeric(raw.cache_creation_input_tokens)) promptDetails.cache_creation_tokens = cacheCreation;
    if (Object.keys(promptDetails).length > 0) usage.prompt_tokens_details = promptDetails;
    if (outputKnown) usage.completion_tokens = output;

    const thinking = raw.output_tokens_details?.thinking_tokens;
    if (isNumeric(thinking)) {
        usage.completion_tokens_details = { reasoning_tokens: thinking };
    }

    if (usage.prompt_tokens !== undefined && usage.completion_tokens !== undefined) {
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
    }
    return Object.keys(usage).length > 0 ? usage : null;
};

/**
 * Gemini generateContent usageMetadata → 归一化 usage。
 * 官方语义：totalTokenCount = prompt + candidates + toolUsePrompt + thoughts；
 * candidatesTokenCount 不包含 thoughtsTokenCount。归一化时：
 * - 加性输入分量 toolUsePromptTokenCount 折算进 prompt_tokens，同时以
 *   prompt_tokens_details.tool_use_tokens 显式保留，使 prompt+completion 对齐 total；
 * - thoughts 折算进 completion_tokens（reasoning_tokens 成为 completion 的子集，
 *   显式的 thoughtsTokenCount:0 保留为 reasoning_tokens:0）；
 * - cachedContentTokenCount 本身是 promptTokenCount 的子集；
 * 约束：prompt/completion 分别只在各自基础分量已知时归一化（thoughts/toolUse-only
 * 不制造另一侧计数）；total 仅在两个基本部分都已知时推算，真实上报的 total 原样保留。
 * 原始值保留在 providerMeta.geminiUsage。
 */
export const normalizeGeminiUsage = (raw: any): ICompletionUsage | null => {
    if (!raw || typeof raw !== 'object') return null;
    const usage: ICompletionUsage = {};
    const promptKnown = isNumeric(raw.promptTokenCount);
    const candidatesKnown = isNumeric(raw.candidatesTokenCount);
    const prompt = promptKnown ? raw.promptTokenCount : 0;
    const candidates = candidatesKnown ? raw.candidatesTokenCount : 0;
    const thoughts = isNumeric(raw.thoughtsTokenCount) ? raw.thoughtsTokenCount : 0;
    const toolUse = isNumeric(raw.toolUsePromptTokenCount) ? raw.toolUsePromptTokenCount : 0;

    if (promptKnown) usage.prompt_tokens = prompt + toolUse;
    const promptDetails: ICompletionUsageDetails = {};
    if (isNumeric(raw.cachedContentTokenCount)) promptDetails.cached_tokens = raw.cachedContentTokenCount;
    if (isNumeric(raw.toolUsePromptTokenCount)) promptDetails.tool_use_tokens = raw.toolUsePromptTokenCount;
    if (Object.keys(promptDetails).length > 0) usage.prompt_tokens_details = promptDetails;
    if (candidatesKnown) usage.completion_tokens = candidates + thoughts;

    if (isNumeric(raw.totalTokenCount)) {
        usage.total_tokens = raw.totalTokenCount;
    } else if (usage.prompt_tokens !== undefined && usage.completion_tokens !== undefined) {
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
    }

    if (isNumeric(raw.thoughtsTokenCount)) {
        usage.completion_tokens_details = { reasoning_tokens: thoughts };
    }
    return Object.keys(usage).length > 0 ? usage : null;
};

// ============================================================================
// reasoning 归一化
// ============================================================================

const detailTypeEncrypted = (type: unknown): boolean =>
    typeof type === 'string' && type.toLowerCase().includes('encrypted');

/** 单个 reasoning detail → 可展示文本；无法以文本表达（加密/签名等）时返回 '' */
const reasoningDetailToText = (item: any): string => {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';
    if (detailTypeEncrypted(item.type)) return '';
    const text = typeof item.text === 'string' ? item.text : '';
    const summary = typeof item.summary === 'string' ? item.summary : '';
    if (!text && !summary) return ''; // 只有 signature/data 等不可读字段 → 忽略，不 stringify
    return text || summary;
};

/**
 * 任意 reasoning 字段值 → 文本。接受字符串、reasoning_details 数组/单对象。
 * 未识别的结构一律忽略（返回 ''），绝不 JSON.stringify 任意对象。
 */
export const reasoningToText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        // reasoning_details 是顺序分片，按原始顺序直接连接
        return value.map(item => reasoningDetailToText(item)).join('');
    }
    if (value && typeof value === 'object') {
        return reasoningDetailToText(value);
    }
    return '';
};

/**
 * 从 OpenAI 兼容消息/delta 中提取 reasoning 文本。
 * 优先级：reasoning_content > reasoning > reasoning_details（OpenRouter：reasoning 与
 * reasoning_details 内容互为冗余，取先到者避免重复展示）。
 */
export const extractOpenAIReasoning = (message: Record<string, any> | null | undefined): string => {
    if (!message || typeof message !== 'object') return '';
    if (typeof message.reasoning_content === 'string' && message.reasoning_content) {
        return message.reasoning_content;
    }
    if (typeof message.reasoning === 'string' && message.reasoning) {
        return message.reasoning;
    }
    if (message.reasoning_details) {
        return reasoningToText(message.reasoning_details);
    }
    return '';
};

/** OpenAI 兼容 delta/消息的 content 提取：字符串或 text part 数组 */
const openAIContentToText = (content: unknown): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter((part: any) => typeof part?.text === 'string')
            .map((part: any) => part.text)
            .join('');
    }
    return '';
};

/** OpenAI 兼容 delta 的逐块提取（流式）；reasoning 不在此处做 think 标签分区 */
export const extractOpenAIDelta = (delta: Record<string, any> | null | undefined): {
    content: string;
    reasoning_content?: string;
    tool_calls?: IToolCallResponse[];
} => {
    const content = openAIContentToText(delta?.content);
    const reasoning = extractOpenAIReasoning(delta);
    const toolCalls = Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0
        ? delta.tool_calls
        : undefined;
    return {
        content,
        ...(reasoning ? { reasoning_content: reasoning } : {}),
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
    };
};

// ============================================================================
// 前缀 <think>...</think> 分区（DeepSeek 风格 OpenAI 兼容 API）
// ============================================================================

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

/** closing 标签可能被分片，暂缓输出可能是其前缀的尾部片段 */
const longestCloseTagPrefix = (text: string): number => {
    for (let len = THINK_CLOSE.length - 1; len > 0; len--) {
        if (text.endsWith(THINK_CLOSE.slice(0, len))) return len;
    }
    return 0;
};

export interface TThinkPartitioner {
    /**
     * 传入完整累积 content，返回全量分区结果（无内部状态，对同一 raw 结果确定）。
     * final=true（流结束 / 非流式解析）：释放暂缓的未闭合字面片段，合法的不匹配
     * 文本不得消失；流式期间保持暂缓，等闭标签到齐再定。
     */
    partition(raw: string, final?: boolean): { reasoning: string; visible: string };
}

/**
 * 只处理「正文最开头」的 <think>...</think> 区段（DeepSeek 风格）：
 * - 开头（忽略前导空白）是 <think> → 其中内容归 reasoning，闭标签之后的归正文；
 * - 闭标签未到齐时暂缓其可能的前缀片段；仍未闭合 → 全部归 reasoning；
 * - 开头不是 think 标签（含正文里合法出现的示例标签）→ 全部保留为正文；
 * 判定完全由 raw 决定（content 只会单调追加，前缀判定不可逆），因此无内部状态。
 */
export const createThinkPartitioner = (): TThinkPartitioner => {
    return {
        partition(raw: string, final = false): { reasoning: string; visible: string } {
            const head = raw.trimStart();
            if (head.length < THINK_OPEN.length && THINK_OPEN.startsWith(head)) {
                // 可能是尚未到齐的开头标签；final 时按字面正文释放
                return final ? { reasoning: '', visible: raw } : { reasoning: '', visible: '' };
            }
            if (!head.startsWith(THINK_OPEN)) {
                return { reasoning: '', visible: raw };
            }
            const openEnd = raw.length - head.length + THINK_OPEN.length;
            const thinkBody = raw.slice(openEnd);
            const closeIdx = thinkBody.indexOf(THINK_CLOSE);
            if (closeIdx >= 0) {
                return {
                    reasoning: thinkBody.slice(0, closeIdx),
                    visible: thinkBody.slice(closeIdx + THINK_CLOSE.length),
                };
            }
            const holdBack = final ? 0 : longestCloseTagPrefix(thinkBody);
            return {
                reasoning: thinkBody.slice(0, thinkBody.length - holdBack),
                visible: '',
            };
        },
    };
};

// ============================================================================
// 流式回调组装
// ============================================================================

/** 旧版第一参格式：reasoning 以 <think>...</think> 包裹（与既有 openai 流式行为一致） */
export const buildStreamMsgText = (content: string, reasoning?: string): string => {
    let msg = '';
    if (reasoning) {
        msg += `<think>
${reasoning}
</think>
`;
    }
    if (content) {
        msg += content;
    }
    return msg;
};

// ============================================================================
// OpenAI 流式工具调用合并（原 adapter.adaptToolCalls 语义）
// ============================================================================

/**
 * 合并流式 tool_calls 分片：标准 OpenAI 格式按 index 合并并拼接 arguments；
 * 若所有分片都带 id（某些平台直接回传完整数组）则原样返回。
 */
export const mergeOpenAIStreamToolCalls = (allChunks: any[][]): IToolCallResponse[] => {
    const flattened = allChunks.flat().filter(call => call && typeof call === 'object');
    if (flattened.length === 0) return [];
    if (flattened.every(call => call.id)) {
        return flattened as IToolCallResponse[];
    }

    const toolCallsByIndex = new Map<number, IToolCallResponse>();
    for (const call of flattened) {
        const index = typeof call.index === 'number' ? call.index : toolCallsByIndex.size;
        const existing = toolCallsByIndex.get(index);
        if (existing) {
            if (call.id && !existing.id) existing.id = call.id;
            if (call.function?.name) existing.function.name = call.function.name;
            existing.function.arguments += call.function?.arguments || '';
        } else {
            toolCallsByIndex.set(index, {
                id: call.id || '',
                index,
                type: call.type || 'function',
                function: {
                    name: call.function?.name || '',
                    arguments: call.function?.arguments || '',
                },
            });
        }
    }
    return Array.from(toolCallsByIndex.values());
};

/**
 * 发给 streamMsg 的 toolCalls 必须是逐次独立的深拷贝：工具对象本身在流式期间持续
 * 被追加 arguments，快照若共享对象引用，早期进度的 arguments 会被追溯改写。
 */
const snapshotToolCalls = (calls: IToolCall[]): IToolCall[] =>
    calls.map(call => ({ ...call, function: { ...call.function } }));

const dedupeReferences = (existing: TResponseReference[], incoming: TResponseReference[]) => {
    for (const ref of incoming) {
        if (ref?.url && !existing.some(item => item.url === ref.url)) {
            existing.push({ ...(ref.title ? { title: ref.title } : {}), url: ref.url });
        }
    }
};

/**
 * 流式读取器的公共骨架：解码 → abort 检查 → 逐事件分发；首次读到数据时记录时刻。
 * read() 的 rejection 在此捕获（以 readError 返回），让消费者能把已累积的部分
 * content / reasoning / usage 以 ok:false 返回，而不是把整个结果丢进上层异常路径。
 */
const readStreamEvents = async (
    response: Response,
    hooks: TProtocolStreamHooks,
    onEvent: (data: string) => void,
): Promise<{ aborted: boolean; firstReadAt: number | null; readError: unknown }> => {
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    const parser = createSseParser(onEvent);
    let aborted = false;
    let firstReadAt: number | null = null;
    let readError: unknown = null;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (hooks.abortController?.signal.aborted) {
                // 取消引发的后续错误不算读取失败；cancel 本身的异常一并吞掉
                await reader.cancel().catch(() => undefined);
                aborted = true;
                break;
            }
            if (done) break;
            if (firstReadAt === null) firstReadAt = Date.now();
            parser.push(value);
        }
    } catch (error) {
        if (!aborted) readError = error;
    }
    if (!aborted) {
        // 读失败后仍冲刷已补完的事件；损坏的半截事件会因 JSON 解析失败被丢出
        parser.flush();
    }
    return { aborted, firstReadAt, readError };
};

const firstReadTime = (t1: number | null): number => t1 ?? Date.now();

const streamTiming = (t0: number, t1: number | null, t2: number, usage: ICompletionUsage | null) => {
    const latency = firstReadTime(t1) - t0;
    const seconds = (t2 - firstReadTime(t1)) / 1000;
    const completion = usage?.completion_tokens;
    return {
        latency,
        throughput: completion && seconds > 0 ? completion / seconds : undefined,
    };
};

// ============================================================================
// OpenAI 兼容协议
// ============================================================================

const formatOpenAIEventError = (error: any): string =>
    `**[Error]** \`\`\`json\n${JSON.stringify(error)}\`\`\``;

/**
 * 消费 OpenAI 兼容流式响应（网络边界）。
 * - usage 只在事件携带时更新（官方最后一个 chunk choices 为空、仅带 usage）；
 * - reasoning 经 reasoning_content/reasoning/reasoning_details 提取，
 *   正文最开头的 <think>...</think> 区段分区为思维链；
 * - 每个有效事件调用 streamMsg(msg, mergedToolCalls, snapshot)。
 */
export const consumeOpenAIStream = async (
    response: Response,
    hooks: TProtocolStreamHooks & {
        extractReferences?: (data: any) => TResponseReference[] | undefined;
    } = {},
): Promise<ICompletionResult> => {
    const result: ICompletionResult = { ok: true, content: '', usage: null, tool_calls: [] };
    if (!response.body) {
        return { ok: false, content: '[Error] Response body is null', usage: null };
    }

    const t0 = hooks.t0 ?? Date.now();
    const partitioner = createThinkPartitioner();
    const toolCallChunks: any[][] = [];
    const references: TResponseReference[] = [];
    let rawUsage: Record<string, any> = {};
    let rawContent = '';
    let errorContent = '';
    let fieldReasoning = '';
    let aborted = false;
    let lastEmitted = ''; // 相同内容的重复 emit（如流结束后的收尾 emit）会被抑制

    const emit = (final = false) => {
        const { reasoning: tagReasoning, visible } = partitioner.partition(rawContent, final);
        const reasoning = joinNonEmpty([fieldReasoning, tagReasoning]);
        // Failure indicators must stay visible even when a leading think block never closed.
        const content = visible + errorContent;
        result.content = content;
        result.reasoning_content = reasoning;
        result.usage = normalizeOpenAIUsage(rawUsage);
        const toolCalls = toolCallChunks.length > 0 ? mergeOpenAIStreamToolCalls(toolCallChunks) : undefined;
        // 指纹包含 toolCalls/references：text 之后的纯 tool 参数事件也必须推送
        const fingerprint = JSON.stringify([content, reasoning, result.usage, toolCalls, references]);
        if (fingerprint === lastEmitted) return; // 抑制重复收尾 emit
        lastEmitted = fingerprint;
        const msg = buildStreamMsgText(content, reasoning);
        hooks.streamMsg?.(msg, toolCalls, {
            content,
            reasoning_content: reasoning,
            usage: result.usage,
        });
    };

    const { aborted: wasAborted, firstReadAt, readError } = await readStreamEvents(response, hooks, (rawData) => {
        if (rawData.trim() === '[DONE]') return;
        const payload = parseJsonSafe<any>(rawData, null);
        if (!payload) return;
        hooks.onRawEvent?.(payload);

        if (payload.error && !payload.choices) {
            errorContent += formatOpenAIEventError(payload.error);
            result.ok = false;
            emit();
            return;
        }

        let meaningful = false;
        if (payload.usage) {
            const before = JSON.stringify(rawUsage);
            rawUsage = mergeRawUsage(rawUsage, payload.usage);
            if (JSON.stringify(rawUsage) !== before) meaningful = true;
        }

        const refers = hooks.extractReferences?.(payload);
        if (refers?.length) {
            dedupeReferences(references, refers);
            meaningful = true;
        }

        const delta = payload.choices?.[0]?.delta ?? {};
        const extracted = extractOpenAIDelta(delta);
        if (extracted.content) {
            rawContent += extracted.content;
            meaningful = true;
        }
        if (extracted.reasoning_content) {
            fieldReasoning += extracted.reasoning_content;
            meaningful = true;
        }
        if (extracted.tool_calls) {
            toolCallChunks.push(extracted.tool_calls);
            meaningful = true;
        }
        if (meaningful) emit();
    });
    aborted = wasAborted;

    if (readError !== null) {
        errorContent += `\n **[Error]** ${readError instanceof Error ? readError.message : String(readError)}`;
        result.ok = false;
    } else if (aborted) {
        errorContent += '\n **[Error]** Request aborted';
        result.ok = false;
    }

    emit(true);
    if (toolCallChunks.length > 0) {
        result.tool_calls = mergeOpenAIStreamToolCalls(toolCallChunks);
    }
    if (references.length > 0) result.references = references;
    result.time = streamTiming(t0, firstReadAt, Date.now(), result.usage);
    return result;
};

/** OpenAI 兼容非流式响应解析（data 为完整响应 JSON） */
export const parseOpenAINonStream = (
    data: any,
    hooks: { extractReferences?: (data: any) => TResponseReference[] | undefined } = {},
): ICompletionResult => {
    const result = parseOpenAIMessage(data?.choices?.[0]?.message ?? {});
    result.usage = normalizeOpenAIUsage(data?.usage);
    const refers = hooks.extractReferences?.(data);
    if (refers?.length) result.references = [...refers];
    return result;
};

/**
 * OpenAI 兼容完整 assistant 消息解析：reasoning 字段提取 + 正文前缀 think 标签分区。
 * （流式 delta 请用 extractOpenAIDelta，不做分区）
 */
export const parseOpenAIMessage = (message: Record<string, any>): ICompletionResult => {
    const extracted = extractOpenAIDelta(message); // delta 与 message 共享同一套字段
    const partitioner = createThinkPartitioner();
    const { reasoning: tagReasoning, visible } = partitioner.partition(extracted.content, true);
    const reasoning = joinNonEmpty([extracted.reasoning_content, tagReasoning]);

    const result: ICompletionResult = {
        ok: true,
        content: visible,
        reasoning_content: reasoning,
    };
    if (extracted.tool_calls?.length) result.tool_calls = extracted.tool_calls;
    return result;
};

// ============================================================================
// Claude 协议
// ============================================================================

const collectClaudeBlocks = (contentBlocks: any[], providerMeta: Record<string, any>): {
    content: string;
    reasoning: string;
    tool_calls: IToolCall[];
} => {
    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const tool_calls: IToolCall[] = [];
    let redactedCount = 0;

    contentBlocks.forEach((block: any, index: number) => {
        if (block?.type === 'text') {
            textParts.push(block.text || '');
            return;
        }
        if (block?.type === 'thinking') {
            thinkingParts.push(block.thinking || '');
            return;
        }
        if (block?.type === 'redacted_thinking') {
            // 官方语义：data 为不可读的加密内容，禁止展示或 stringify
            redactedCount++;
            return;
        }
        if (block?.type === 'tool_use') {
            tool_calls.push({
                id: block.id || `claude_call_${index}`,
                type: 'function',
                function: {
                    name: block.name || 'tool',
                    arguments: JSON.stringify(block.input ?? {}),
                },
            });
        }
    });
    if (redactedCount > 0) providerMeta.redactedThinkingBlocks = redactedCount;

    return { content: textParts.join(''), reasoning: thinkingParts.join(''), tool_calls };
};

/** Claude 非流式响应解析 */
export const parseClaudeResponse = (data: any): ICompletionResult => {
    const providerMeta: Record<string, any> = { stop_reason: data?.stop_reason };
    if (data?.usage) providerMeta.claudeUsage = data.usage;
    const blocks = collectClaudeBlocks(data?.content || [], providerMeta);
    return {
        ok: true,
        content: blocks.content,
        usage: normalizeClaudeUsage(data?.usage),
        tool_calls: blocks.tool_calls,
        reasoning_content: blocks.reasoning || undefined,
        providerMeta,
    };
};

/** Claude 流式响应消费（named SSE 事件；thinking_delta 也即时推送） */
export const consumeClaudeStream = async (
    response: Response,
    hooks: TProtocolStreamHooks = {},
): Promise<ICompletionResult> => {
    const result: ICompletionResult = { ok: true, content: '', usage: null, tool_calls: [] };
    if (!response.body) {
        return { ok: false, content: '[Error] Claude stream response body is null', usage: null };
    }

    const t0 = hooks.t0 ?? Date.now();
    const providerMeta: Record<string, any> = {};
    const toolCallsById = new Map<string, IToolCall>();
    const toolIndexToId = new Map<number, string>();
    const thinkingIndexes = new Set<number>();
    let rawUsage: Record<string, any> = {};
    let content = '';
    let thinking = '';
    let stopReason = '';
    let aborted = false;
    let lastEmitted = '';

    const emit = () => {
        result.content = content;
        result.reasoning_content = thinking || undefined;
        result.usage = normalizeClaudeUsage(rawUsage);
        const toolCalls = toolCallsById.size > 0 ? snapshotToolCalls(Array.from(toolCallsById.values())) : undefined;
        // 指纹包含 toolCalls：tool 注册 / 参数追加也推送进度
        const fingerprint = JSON.stringify([content, thinking, result.usage, toolCalls]);
        if (fingerprint === lastEmitted) return;
        lastEmitted = fingerprint;
        hooks.streamMsg?.(
            buildStreamMsgText(content, thinking),
            toolCalls,
            { content, reasoning_content: thinking || undefined, usage: result.usage },
        );
    };

    const { aborted: wasAborted, firstReadAt, readError } = await readStreamEvents(response, hooks, (rawData) => {
        if (rawData.trim() === '[DONE]') return;
        const payload = parseJsonSafe<any>(rawData, null);
        if (!payload) return;
        hooks.onRawEvent?.(payload);

        if (payload.type === 'error') {
            content += `\n[Error] ${payload.error?.message || JSON.stringify(payload.error)}`;
            result.ok = false;
            emit();
            return;
        }

        if (payload.type === 'message_start') {
            rawUsage = mergeRawUsage(rawUsage, payload.message?.usage);
            return;
        }
        if (payload.type === 'message_delta') {
            stopReason = payload.delta?.stop_reason || stopReason;
            rawUsage = mergeRawUsage(rawUsage, payload.usage);
            emit();
            return;
        }

        if (payload.type === 'content_block_start') {
            const idx = payload.index;
            const block = payload.content_block;
            if (block?.type === 'thinking') {
                thinkingIndexes.add(idx);
                return;
            }
            if (block?.type === 'tool_use') {
                const id = block.id || `claude_call_${idx}`;
                toolIndexToId.set(idx, id);
                toolCallsById.set(id, {
                    id,
                    index: idx,
                    type: 'function',
                    function: {
                        name: block.name || 'tool',
                        // Fix C: 初始化为 ''，input_json_delta 无条件追加
                        arguments: Object.keys(block.input ?? {}).length > 0 ? JSON.stringify(block.input) : '',
                    },
                });
                emit();
            }
            return;
        }

        if (payload.type === 'content_block_delta') {
            const delta = payload.delta || {};
            if (delta.type === 'text_delta') {
                content += delta.text || '';
                emit();
                return;
            }
            if (delta.type === 'thinking_delta') {
                thinking += delta.thinking || '';
                emit();
                return;
            }
            if (delta.type === 'input_json_delta') {
                const id = toolIndexToId.get(payload.index);
                const toolCall = id ? toolCallsById.get(id) : undefined;
                if (!toolCall) return;
                // Fix C: 无条件追加（分片是原始 JSON 文本片段）
                toolCall.function.arguments += (delta.partial_json || '');
                emit();
            }
            // signature_delta 等不可读 delta 忽略
        }
    });
    aborted = wasAborted;

    if (readError !== null) {
        content += `\n[Error] ${readError instanceof Error ? readError.message : String(readError)}`;
        result.ok = false;
    } else if (aborted) {
        content += '\n[Error] Request aborted';
        result.ok = false;
    }

    emit();
    result.tool_calls = Array.from(toolCallsById.values());
    providerMeta.stop_reason = stopReason;
    providerMeta.claudeUsage = rawUsage;
    result.providerMeta = providerMeta;
    result.time = streamTiming(t0, firstReadAt, Date.now(), result.usage);
    return result;
};

// ============================================================================
// Gemini 协议
// ============================================================================

const collectGeminiParts = (parts: any[], toolCallIdOf: (partIndex: number) => string): {
    content: string;
    reasoning: string;
    tool_calls: IToolCall[];
} => {
    const textParts: string[] = [];
    const thoughtParts: string[] = [];
    const tool_calls: IToolCall[] = [];
    parts.forEach((part: any, partIndex: number) => {
        if (typeof part?.text === 'string' && part.text) {
            if (part.thought === true) {
                thoughtParts.push(part.text);
            } else {
                textParts.push(part.text);
            }
            return;
        }
        const functionCall = part?.functionCall;
        if (functionCall?.name) {
            tool_calls.push({
                id: toolCallIdOf(partIndex),
                type: 'function',
                function: {
                    name: functionCall.name,
                    arguments: JSON.stringify(functionCall.args ?? {}),
                },
            });
        }
    });
    return { content: textParts.join(''), reasoning: thoughtParts.join(''), tool_calls };
};

/** Gemini 非流式响应解析 */
export const parseGeminiResponse = (data: any): ICompletionResult => {
    const first = data?.candidates?.[0];
    const blocks = collectGeminiParts(first?.content?.parts || [], (partIndex) => `gemini_call_${partIndex}`);
    const providerMeta: Record<string, any> = {
        safetyRatings: first?.safetyRatings,
        promptFeedback: data?.promptFeedback,
        finishReason: first?.finishReason,
    };
    if (data?.usageMetadata) providerMeta.geminiUsage = data.usageMetadata;
    return {
        ok: true,
        content: blocks.content,
        usage: normalizeGeminiUsage(data?.usageMetadata),
        tool_calls: blocks.tool_calls,
        reasoning_content: blocks.reasoning || undefined,
        providerMeta,
    };
};

/** Gemini 流式响应消费（alt=sse；每个 chunk 是完整部分快照，functionCall 参数整体替换） */
export const consumeGeminiStream = async (
    response: Response,
    hooks: TProtocolStreamHooks = {},
): Promise<ICompletionResult> => {
    const result: ICompletionResult = { ok: true, content: '', usage: null, tool_calls: [] };
    if (!response.body) {
        return { ok: false, content: '[Error] Gemini stream response body is null', usage: null };
    }

    const t0 = hooks.t0 ?? Date.now();
    const providerMeta: Record<string, any> = {};
    let rawUsage: Record<string, any> = {};
    let content = '';
    let reasoning = '';
    let lastEmitted = '';
    let toolCallCounter = 0;
    const toolCallKeyToId = new Map<string, string>(); // partIndex → 稳定 id
    const toolCalls = new Map<string, IToolCall>();    // 稳定 id → IToolCall
    let aborted = false;

    const emit = () => {
        result.content = content;
        result.reasoning_content = reasoning || undefined;
        result.usage = normalizeGeminiUsage(rawUsage);
        const currentToolCalls = toolCalls.size > 0 ? snapshotToolCalls(Array.from(toolCalls.values())) : undefined;
        // 指纹包含 toolCalls：functionCall 快照更新 / usage 更新都推送
        const fingerprint = JSON.stringify([content, reasoning, result.usage, currentToolCalls]);
        if (fingerprint === lastEmitted) return;
        lastEmitted = fingerprint;
        hooks.streamMsg?.(
            buildStreamMsgText(content, reasoning),
            currentToolCalls,
            { content, reasoning_content: reasoning || undefined, usage: result.usage },
        );
    };

    const { aborted: wasAborted, firstReadAt, readError } = await readStreamEvents(response, hooks, (rawData) => {
        if (rawData.trim() === '[DONE]') return;
        const payload = parseJsonSafe<any>(rawData, null);
        if (!payload) return;
        hooks.onRawEvent?.(payload);

        let meaningful = false;
        const first = payload?.candidates?.[0];
        (first?.content?.parts || []).forEach((part: any, partIndex: number) => {
            if (typeof part?.text === 'string' && part.text) {
                if (part.thought === true) {
                    reasoning += part.text;
                } else {
                    content += part.text;
                }
                meaningful = true;
                return;
            }
            const functionCall = part?.functionCall;
            if (functionCall?.name) {
                // 首次遇到该 partIndex 分配稳定递增 id，后续事件复用
                const internalKey = String(partIndex);
                let id = toolCallKeyToId.get(internalKey);
                if (!id) {
                    id = `gemini_call_${toolCallCounter++}`;
                    toolCallKeyToId.set(internalKey, id);
                }
                // Gemini 流式发送完整参数快照：整体替换而非追加
                toolCalls.set(id, {
                    id,
                    index: partIndex,
                    type: 'function',
                    function: {
                        name: functionCall.name,
                        arguments: JSON.stringify(functionCall.args ?? {}),
                    },
                });
                meaningful = true;
            }
        });

        if (payload.usageMetadata) {
            rawUsage = mergeRawUsage(rawUsage, payload.usageMetadata);
            meaningful = true;
        }
        if (first?.safetyRatings) providerMeta.safetyRatings = first.safetyRatings;
        if (payload.promptFeedback) providerMeta.promptFeedback = payload.promptFeedback;
        if (first?.finishReason) providerMeta.finishReason = first.finishReason;

        if (meaningful) emit();
    });
    aborted = wasAborted;

    if (readError !== null) {
        content += `\n[Error] ${readError instanceof Error ? readError.message : String(readError)}`;
        result.ok = false;
    } else if (aborted) {
        content += '\n[Error] Request aborted';
        result.ok = false;
    }

    emit();
    result.tool_calls = Array.from(toolCalls.values());
    result.providerMeta = { ...providerMeta, geminiUsage: rawUsage };
    result.time = streamTiming(t0, firstReadAt, Date.now(), result.usage);
    return result;
};
