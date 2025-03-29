/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:25:34
 * @FilePath     : /src/func/gpt/context-provider/UserInputProvider.ts
 * @LastEditTime : 2025-03-28 16:01:34
*/

export const UserInputProvider: CustomContextProvider = {
    type: "input-area",
    name: "UserInput",
    icon: 'iconMarkdown',
    displayTitle: "用户编辑",
    description: "以下是由用户直接提供的一些相关材料",
    getContextItems: async (options?: {
        query: string;
    }): Promise<ContextItem[]> => {
        return [{
            name: "用户提供的相关材料",
            description: "",
            content: options?.query || "",
        }];
    },
};
