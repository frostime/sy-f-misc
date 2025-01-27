/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:10:29
 * @FilePath     : /src/func/gpt/context-provider/types.d.ts
 * @LastEditTime : 2025-01-27 19:44:17
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


type ContextProviderType = "normal" | "query" | "submenu";

interface CustomContextProvider {
    name: string;
    icon?: string;
    displayTitle?: string;
    description?: string;
    type?: ContextProviderType;
    getContextItems(input?: {
        query?: string;
        selected?: string[] | ContextSubmenuItem[];
    }): Promise<ContextItem[]>;
    loadSubmenuItems?: (
        args: {},
    ) => Promise<ContextSubmenuItem[]>;
}


interface IProvidedContext {
    id: string;
    name: string;
    displayTitle: string;
    description: string;
    contextItems: ContextItem[];
}
