import { showMessage } from "siyuan";
import { checkSupportsModality } from "../setting";
import { type complete } from "./complete";

// ============================================================================
// Thinking budget 内置回退表（Claude/Gemini 协议用）
// ============================================================================

export const DEFAULT_THINKING_BUDGETS: Record<string, number> = {
    minimal: 1024,
    low: 2048,
    medium: 8192,
    high: 16384,
    xhigh: 32768,
};

// ============================================================================
// applyOptionCompat
// ============================================================================

const ALL_EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

/** clamp effort 到 supportedEfforts 中最近的可用值（优先高一级，其次低一级）
 *  注意：'none' 表示关闭 thinking，不参与 clamp，调用方应在调用前过滤 */
const clampEffort = (
    effort: ReasoningEffort,
    supported: ReasoningEffort[],
): ReasoningEffort => {
    if (supported.includes(effort)) return effort;
    const idx = ALL_EFFORTS.indexOf(effort);
    for (let i = idx + 1; i < ALL_EFFORTS.length; i++) {
        if (supported.includes(ALL_EFFORTS[i])) return ALL_EFFORTS[i];
    }
    for (let i = idx - 1; i >= 0; i--) {
        if (supported.includes(ALL_EFFORTS[i])) return ALL_EFFORTS[i];
    }
    return supported[0];
};

/**
 * 应用模型兼容配置 + toggle 开关，返回处理后的 option 副本。
 *
 * 处理顺序：
 *   1. toggle=false 的 key 删除
 *   2. compat.unsupported 删除
 *   3. thinking 参数按 thinkingStyle 注入（仅 OpenAI 兆容路径）
 */
export const applyOptionCompat = (
    chatOption: IChatCompleteOption,
    toggles: Partial<Record<keyof IChatCompleteOption, boolean>> | undefined,
    compat: ILLMOptionCompat | undefined,
    protocol: LLMProviderProtocol = 'openai',
): IChatCompleteOption => {
    const option = structuredClone(chatOption) as IChatCompleteOption & Record<string, any>;

    // 1. Toggle 删除（key 不存在视为 true，兼容旧数据）
    for (const key of Object.keys(option)) {
        if ((toggles as any)?.[key] === false) {
            delete option[key];
        }
    }

    // 2. Unsupported 删除
    if (compat?.unsupported) {
        for (const key of compat.unsupported) {
            delete option[key];
        }
    }

    // 3. Thinking 参数注入（仅 OpenAI-compatible 路径）
    const thinking = compat?.thinking;
    if (thinking?.enabled) {
        const rawEffort = option.reasoning_effort as ReasoningEffort | undefined;
        let effort = rawEffort;

        // supportedEfforts 校验：none 不参与 clamp（由后续 effort !== 'none' 判断处理）
        if (effort && effort !== 'none' && thinking.supportedEfforts?.length) {
            effort = clampEffort(effort, thinking.supportedEfforts);
        }

        // Claude / Gemini 由各自 payload builder 自己处理 thinking 语义，避免协议字段泄漏
        if (protocol !== 'openai') {
            return option;
        }

        const style = thinking.thinkingStyle ?? 'openai';
        const effortMap = thinking.effortMap;

        if (style === 'deepseek') {
            // DeepSeek: 额外发 thinking.type + 保留 reasoning_effort
            option.thinking = { type: effort && effort !== 'none' ? 'enabled' : 'disabled' };
            if (effort && effort !== 'none') {
                option.reasoning_effort = (effortMap?.[effort] ?? effort) as ReasoningEffort;
            } else {
                delete option.reasoning_effort;
            }
        } else if (style === 'qwen') {
            // Qwen3: 用 enable_thinking 替代 reasoning_effort
            delete option.reasoning_effort;
            option.enable_thinking = !!(effort && effort !== 'none');
        } else {
            // openai（默认）: 只发 reasoning_effort
            if (effort && effort !== 'none') {
                option.reasoning_effort = (effortMap?.[effort] ?? effort) as ReasoningEffort;
            } else {
                delete option.reasoning_effort;
            }
        }
    }

    return option;
};

/**
 * 用户自定义的预处理器, 可以在发送 complete 请求之前，对消息进行处理
 *
 * 例如: 实现 Deepseek V3 0324 的默认温度缩放; 特别模型不支持 frequency_penalty 等参数需要删除等
 *
 * @param payload - 选项
 * @param payload.model - 模型
 * @param payload.modelDisplayName - 模型名称; 例如用户配置了重定向，{ [modelDisplayName]: modelName }; 比如 {'Deepseek V3': 'deepseek-ai/deepseek-v3'}
 * @param payload.url - API URL
 * @param payload.option - 选项
 * @returns void
 */
export const userCustomizedPreprocessor = {
    preprocess: (payload: {
        model: string;
        modelDisplayName: string;
        url: string;
        option: IChatCompleteOption;
    }) => {

    }
};

export const adpatInputMessage = (input: Parameters<typeof complete>[0], options: {
    model: IRuntimeLLM;
}) => {
    let messages: IMessage[] = [];
    if (typeof input === 'string') {
        messages = [{
            "role": "user",
            "content": input
        }];
    } else {
        const ALLOWED_FIELDS = ['role', 'content', 'tool_call_id', 'tool_calls', 'name'];
        // 去掉可能的不需要的字段
        messages = input.map(item => {
            const result = {};
            for (const key in item) {
                if (ALLOWED_FIELDS.includes(key)) {
                    result[key] = item[key];
                }
            }
            return result as IMessage;
        });
    }

    if (options) {
        // const modelId = options?.modelId ?? options?.model;
        // 非视觉模型去掉图片消息字段
        // #TODO 兼容后面各种输入类型
        if (!checkSupportsModality(options.model.config, 'image')) {
            let hasImage = false;
            messages.forEach(item => {
                if (typeof item.content !== 'string') {
                    const content = item.content.filter(content => content.type === 'text');
                    hasImage = content.length !== item.content.length;
                    item.content = content;
                }
            });
            if (hasImage) {
                console.warn(`注意: 模型 ${options.model.model ?? options.model} 不支持图片消息!已在内部自动过滤图片信息。`);
            }
        }
    }

    return messages;
}

export const adaptChatOptions = (target: {
    chatOption: IChatCompleteOption;
    runtimeLLM: IRuntimeLLM;
    toggles?: Partial<Record<keyof IChatCompleteOption, boolean>>;
}) => {
    let { runtimeLLM, chatOption, toggles } = target;

    const config = runtimeLLM.config;

    chatOption = structuredClone(chatOption);

    // Step 1: Apply compat (toggle 删除 + unsupported + thinking 注入)
    const protocol = (runtimeLLM?.provider?.protocol || runtimeLLM?.provider?.protocal || runtimeLLM?.protocol || 'openai') as LLMProviderProtocol;
    chatOption = applyOptionCompat(chatOption, toggles, config?.options?.compat, protocol);

    // Step 2: Remove null/undefined values
    for (const key in chatOption) {
        if (chatOption[key] === null || chatOption[key] === undefined || chatOption[key] === '') {
            delete chatOption[key];
        }
    }

    // Step 3: Filter legacy unsupported options (compat.unsupported already handled in applyOptionCompat)
    // 保留兼容: 旧数据可能只有 options.unsupported 而无 compat.unsupported
    if (config?.options?.unsupported && !config?.options?.compat?.unsupported) {
        for (const key of config.options.unsupported) {
            delete chatOption[key];
        }
    }

    // Step 4: Apply limits
    if (config?.limits) {
        // Temperature range
        if (config.limits.temperatureRange && chatOption.temperature !== undefined) {
            const [min, max] = config.limits.temperatureRange;
            chatOption.temperature = Math.max(min, Math.min(max, chatOption.temperature));
        }

        // Max output tokens
        // #TODO 暂时先不做这个限制
        // if (config.limits.maxOutput && chatOption.max_tokens !== undefined) {
        //     chatOption.max_tokens = Math.min(config.limits.maxOutput, chatOption.max_tokens);
        // }
    }

    // Step 5: Check capabilities and filter options
    if (config?.capabilities) {
        const disabledKeys = [];
        // Tools support
        if (config.capabilities.tools !== true && chatOption.tools) {
            delete chatOption.tools;
            delete chatOption.tool_choice;
            disabledKeys.push('tools');
        }

        // Streaming support
        if (config.capabilities.streaming !== true && chatOption.stream) {
            chatOption.stream = false;
            disabledKeys.push('stream');
        }

        // Reasoning effort support (legacy fallback only)
        // 新系统优先走 options.compat.thinking.enabled；
        // 只有没有 compat.thinking 配置时，才回退检查旧 capabilities.reasoningEffort。
        const compatThinkingEnabled = config?.options?.compat?.thinking?.enabled === true;
        if (!compatThinkingEnabled && config.capabilities.reasoningEffort !== true && chatOption.reasoning_effort) {
            delete chatOption.reasoning_effort;
            disabledKeys.push('reasoning_effort');
        }
        if (disabledKeys.length) {
            showMessage(`${runtimeLLM.bareId} 不支持参数 ${disabledKeys.join(', ')}, 已自动移除`);
        }
    }

    // Step 6: Remove old hardcoded default-value guards (replaced by toggle mechanism)
    // deleteIfEqual logic removed — toggles now handle explicit opt-in/opt-out

    return chatOption;
}


export type TReference = {
    title?: string;
    url: string;
};

/**
 * Adapts various reference formats from API responses into a standardized format
 * Handles multiple possible formats:
 * 1. Standard {title, url} format
 * 2. Citations format
 * 3. Plain URL strings
 * 4. Array of URLs
 */
export const adaptResponseReferences = (responseData: any): TReference[] | undefined => {
    if (!responseData) return undefined;

    const mapper = (item: any): TReference => {
        if (item === null || item === undefined || item === '') return null;
        if (typeof item === 'string') {
            // Handle plain URL string
            return { url: item, title: item };
        }
        if (item.url) {
            return {
                title: item.title || item.url,
                url: item.url
            };
        }
        return null;
    }

    const testExtract = (key: string) => {
        if (responseData[key] && Array.isArray(responseData[key])) {
            return responseData[key].map(mapper).filter(Boolean);
        }
        return undefined;
    }

    const keysToTry = ['references', 'citations'];
    for (const key of keysToTry) {
        const result = testExtract(key);
        if (result) {
            return result;
        }
    }

    return undefined;
}


/**
 * 处理响应消息，提取内容、推理内容和工具调用
 * @param message 响应消息
 * @returns 处理后的消息
 */
export const adaptResponseMessage = (message: Record<string, string>): {
    content: string;
    reasoning_content?: string;
    tool_calls?: IToolCallResponse[];
} => {
    const result: any = {
        content: message['content'] || '',
        reasoning_content: ''
    };

    // 处理 reasoning_content
    if (message['reasoning_content']) {
        result.reasoning_content = message['reasoning_content'];
    } else if (message['reasoning']) {
        result.reasoning_content = message['reasoning'];
    }

    // 处理 tool_calls
    if (message['tool_calls']) {
        result.tool_calls = message['tool_calls'];
    }

    return result;
}

/**
 * 处理流式响应的数据块
 * @param messageInChoices 响应消息
 * @returns 处理后的消息
 */
export const adaptChunkMessage = (messageInChoices: Record<string, any>): {
    content: string;
    reasoning_content?: string;
    tool_calls?: IToolCallResponse[];
} => {
    return adaptResponseMessage(messageInChoices);
}

/**
 * 统一处理和合并 tool calls 的适配器
 * 用于在流式响应中累积合并多个 chunk 中的 tool_calls
 *
 * @param allChunks 所有收集到的 tool_calls chunks
 * @returns 合并后的 tool_calls 数组
 *
 * 标准 OpenAI 格式; 需要合并 arguments 字段
```json
[
  // 第一条 tool 开始
  [{"function":{"arguments":"{\"format\": \"YYYY-MM-DD HH:mm:ss\", \"timezone\": \"Asia/Shanghai\"}","name":"datetime"},"id":"call_kbKHaPTeeYcqie9QXC8MgcsS","index":0,"type":"function"}],
  [{"function":{"arguments":"{\"fo"},"index":0}],
  // ... 第二条 tool
  [{"function":{"arguments":"{\"input\": \"这是一个测试文本123abc。\", \"operation\": \"find\", \"search\": \"\\\\d+\"}","name":"text"},"id":"call_PM0hVYGDBYzdTZ8VsDWtejuL","index":1,"type":"function"}],
  [{"function":{"arguments":"{\"in"},"index":1}]
]
```
 */
export const adaptToolCalls = (
    allChunks: any[][]
): IToolCallResponse[] => {
    // console.log(allChunks)
    const toolCallsMap = new Map<number, IToolCallResponse>();

    // 先展开成一维数组
    const flattenedChunks = allChunks.flat();

    const toolCallIdNumber = flattenedChunks.filter(call => call.id).length;
    if (toolCallIdNumber === flattenedChunks.length) {
        //特殊情况：所有 chunk 都有 id，说明每个 chunk 都是完整的 tool call，不需要合并，直接返回
        //某平台适配 gemini 格式不到位，返回了 chunck 格式和标准格式不同
        return flattenedChunks;
    }

    for (const call of flattenedChunks) {
        if (toolCallsMap.has(call.index)) {
            // 合并参数
            const existing = toolCallsMap.get(call.index);
            existing.function.arguments += call.function.arguments;
        } else {
            toolCallsMap.set(call.index, { ...call });
        }
    }

    return Array.from(toolCallsMap.values());
}
