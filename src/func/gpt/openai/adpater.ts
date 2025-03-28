import { visualModel } from "../setting";
import { type complete } from "./complete";


/**
 * 用户自定义的预处理器, 可以在发送 complete 请求之前，对消息进行处理
 * 
 * 例如: 实现 Deepseek V3 0324 的默认温度缩放; 特别模型不支持 frequency_penalty 等参数需要删除等
 * 
 * @param payload - 选项
 * @param payload.model - 模型
 * @param payload.url - API URL
 * @param payload.option - 选项
 * @returns void
 */
export const userCustomizedPreprocessor = {
    preprocess: (payload: {
        model: string;
        url: string;
        option: IChatOption;
    }) => {

    }
};

export const adpatInputMessage = (input: Parameters<typeof complete>[0], options: {
    model: string;
}) => {
    let messages: IMessage[] = [];
    if (typeof input === 'string') {
        messages = [{
            "role": "user",
            "content": input
        }];
    } else {
        // 去掉可能的不需要的字段
        messages = input.map(item => ({
            role: item.role,
            content: item.content
        }));
    }

    if (options) {
        const model = options?.model;
        // 非视觉模型去掉图片消息字段
        if (!visualModel().includes(model)) {
            let hasImage = false;
            messages.forEach(item => {
                if (typeof item.content !== 'string') {
                    const content = item.content.filter(content => content.type === 'text');
                    hasImage = content.length !== item.content.length;
                    item.content = content;
                }
            });
            if (hasImage) {
                console.warn(`注意: 模型 ${model} 不支持图片消息!已在内部自动过滤图片信息。`);
            }
        }
    }

    return messages;
}

export const adaptChatOptions = (target: {
    chatOption: IChatOption;
    model: string;
    apiUrl: string
}) => {
    let { model, apiUrl, chatOption } = target;

    chatOption = structuredClone(chatOption);
    for (const key in chatOption) {
        if (chatOption[key] === null || chatOption[key] === undefined) {
            delete chatOption[key];
        }

        //有些模型不支持这两个参数, 反正不填默认就是 0，那干脆可以闪电
        if (key === 'frequency_penalty' && chatOption[key] === 0) {
            delete chatOption[key];
        }

        if (key === 'presence_penalty' && chatOption[key] === 0) {
            delete chatOption[key];
        }
    }


    model = model.toLocaleLowerCase();

    const isDoubao = model.match(/doubao/);
    if (isDoubao) {
        // temperature
        if (chatOption.temperature > 1) {
            chatOption.temperature = 1;
        }
    }

    // SB 硅基流动只允许 max_tokens 小于 4096
    // if (apiUrl.startsWith('https://api.siliconflow.cn/') && model.endsWith('deepseek-ai/deepseek-v3')) {
    //     if (chatOption?.max_tokens > 4096) {
    //         chatOption.max_tokens = 4096;
    //     }
    // }

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
