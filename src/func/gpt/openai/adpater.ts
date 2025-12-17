import { showMessage } from "siyuan";
import { checkSupportsModality } from "../setting";
import { type complete } from "./complete";


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
        const ALLOWED_FIELDS = ['role', 'content', 'tool_call_id', 'tool_calls'];
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
}) => {
    let { runtimeLLM, chatOption } = target;

    // Extract model and url for backward compatibility
    // const model = runtimeLLM.model;
    // const apiUrl = runtimeLLM.url;
    const config = runtimeLLM.config;

    const deleteIfEqual = (target: Record<string, any>, key: string, value = 0) => {
        if (target[key] === value) {
            delete target[key];
        }
    }

    chatOption = structuredClone(chatOption);

    // Step 1: Apply customOverride (highest priority)
    // if (config?.options?.customOverride) {
    //     Object.assign(chatOption, config.options.customOverride);
    // }

    // Step 2: Remove null/undefined values
    for (const key in chatOption) {
        if (chatOption[key] === null || chatOption[key] === undefined || chatOption[key] === '') {
            delete chatOption[key];
        }
    }

    // Step 3: Filter unsupported options
    if (config?.options?.unsupported) {
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

        // Reasoning effort support
        if (config.capabilities.reasoningEffort !== true && chatOption.reasoning_effort) {
            delete chatOption.reasoning_effort;
            disabledKeys.push('reasoning_effort');
        }
        if (disabledKeys.length) {
            showMessage(`${runtimeLLM.bareId} 不支持参数 ${disabledKeys.join(', ')}, 已自动移除`);
        }
    }

    // Step 6: Existing cleanup logic (delete default values)
    deleteIfEqual(chatOption, 'frequency_penalty', 0);
    deleteIfEqual(chatOption, 'presence_penalty', 0);
    deleteIfEqual(chatOption, 'max_tokens', 0);
    deleteIfEqual(chatOption, 'top_p', 1);

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
