import { visualModel } from "../setting";
import { type complete } from "./complete";

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
    }


    model = model.toLocaleLowerCase();
    // Gemini 官方 OpenAI 适配接口目前 (2025-02-14) 还不支持这两个参数
    const isGemini = model.match(/gemini/);
    if (isGemini && apiUrl.startsWith('https://generativelanguage.googleapis.com/v1beta/openai')) {
        for (const key in chatOption) {
            if (key === 'presence_penalty' || key === 'frequency_penalty') {
                delete chatOption[key];
            }
        }
    }

    const isDoubao = model.match(/doubao/);
    if (isDoubao) {
        // temperature
        if (chatOption.temperature > 1) {
            chatOption.temperature = 1;
        }
    }

    // SB 硅基流动
    if (apiUrl.startsWith('https://api.siliconflow.cn/') && model.endsWith('deepseek-ai/deepseek-v3')) {
        if (chatOption?.max_tokens > 4096) {
            chatOption.max_tokens = 4096;
        }
    }

    return chatOption;
}


export type TReference = {
    title: string;
    url: string;
};
/**
 * 一些联网的请求里面会有引用
 */
export const adaptResponseReferences = (data: any): TReference[] | undefined => {
    if (data.references) {
        return data.references.map((item: any) => ({
            title: item.title,
            url: item.url
        }));
    }
    return undefined;
}
