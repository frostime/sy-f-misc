import { type complete } from "./complete";

export const adpatInputMessage = (input: Parameters<typeof complete>[0]) => {
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
