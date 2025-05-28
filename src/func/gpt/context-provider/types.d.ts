/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:10:29
 * @FilePath     : /src/func/gpt/context-provider/types.d.ts
 * @LastEditTime : 2025-02-23 21:43:02
 * @Description  : 
 */
interface ContextItem {
    name: string;
    description: string;
    content: string;
}

interface ContextSubmenuItem {
    id: string;
    title: string;
    description?: string;
}


type ContextProviderType = "normal" | "input-line" | "input-area" | "submenu";

interface CustomContextProvider {
    name: string;
    displayTitle: string;
    description: string;
    icon?: string;
    type?: ContextProviderType;
    getContextItems(input?: {
        query?: string;
        selected?: string[] | ContextSubmenuItem[];
    }): Promise<ContextItem[]>;
    loadSubmenuItems?: (
        args: {},
    ) => Promise<ContextSubmenuItem[]>;
    /**
     * 如果不实现此方法，使用 Provider 的元信息
     */
    contextMetaInfo?: (context?: {
        input: Parameters<CustomContextProvider['getContextItems']>[0],
        items: ContextItem[]
    }) => {
        name: string;
        displayTitle: string;
        description: string;
    };
    [key: string]: any;
}


interface IProvidedContext {
    id: string;
    name: string;
    displayTitle: string;
    description: string;
    contextItems: ContextItem[];
}
