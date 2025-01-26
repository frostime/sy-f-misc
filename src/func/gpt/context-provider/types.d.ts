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
    displayTitle?: string;
    description?: string;
    type?: ContextProviderType;
    getContextItems(input?: {
        query?: string;
        selected?: string,[];
    }): Promise<ContextItem[]>;
    loadSubmenuItems?: (
        args: {},
    ) => Promise<ContextSubmenuItem[]>;
}


interface IProvidedContext {
    name: string;
    displayTitle: string;
    description: string;
    contextItems: ContextItem[];
}
