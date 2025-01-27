/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:32:00
 * @FilePath     : /src/func/gpt/context-provider/ActiveDocProvider.ts
 * @LastEditTime : 2025-01-27 19:41:36
 * @Description  : 
 */
import { getMarkdown } from "@frostime/siyuan-plugin-kits";
import { getBlockByID } from "@frostime/siyuan-plugin-kits/api";


const FocusDocProvider: CustomContextProvider = {
    name: "FocusDoc",
    icon: 'iconFile',
    displayTitle: "当前文档",
    description: "当前编辑器聚焦的文档",
    getContextItems: async (options?: any): Promise<ContextItem[]> => {
        let tabs = document.querySelectorAll(`div[data-type="wnd"] ul.layout-tab-bar>li.item--focus`);
        if (!tabs || tabs.length === 0) {
            return [];
        }
        let docIds = [];
        tabs.forEach(tab => {
            let dataId = tab.getAttribute("data-id");
            if (dataId) {
                const activeTab = document.querySelector(`.layout-tab-container.fn__flex-1>div.protyle[data-id="${dataId}"]`);
                if (activeTab) {
                    const eleTitle = activeTab.querySelector(".protyle-title");
                    let docId = eleTitle?.getAttribute("data-node-id");
                    if (docId) {
                        docIds.push(docId);
                    }
                }
            }
        });


        const parseTab = async (docId: string) => {
            const doc = await getBlockByID(docId);
            const content = await getMarkdown(docId);
            return {
                name: doc.content,
                description: `文档: ${doc.hpath}`,
                content: content,
            };
        };

        let contextItems: ContextItem[] = [];
        for (const docId of docIds) {
            let contextItem = await parseTab(docId); // Pass the docId to parseTab
            if (contextItem) {
                contextItems.push(contextItem);
            }
        }
        return contextItems;
    },
};


const OpenedDocProvider: CustomContextProvider = {
    name: "OpenedDoc",
    icon: 'iconFile',
    displayTitle: "打开文档",
    description: "当前编辑器中打开的文档",
    "type": "submenu",
    getContextItems: async (options: {
        selected: ContextSubmenuItem[];
    }): Promise<ContextItem[]> => {

        const parseItem = async (item: ContextSubmenuItem) => {
            const content = await getMarkdown(item.id);
            return {
                name: item.title,
                description: `文档: ${item.description}`,
                content: content,
            };
        };

        let contextItems: ContextItem[] = [];
        for (const item of options.selected) {
            let contextItem = await parseItem(item); // Pass the docId to parseTab
            if (contextItem) {
                contextItems.push(contextItem);
            }
        }
        return contextItems;
    },
    loadSubmenuItems: async (args: any) => {
        let tabs = document.querySelectorAll(`div[data-type="wnd"] ul.layout-tab-bar>li.item:not(.item--readonly)`);
        if (!tabs || tabs.length === 0) {
            return [];
        }
        let items: ContextSubmenuItem[] = [];

        for (const tab of tabs) {
            let dataId = tab.getAttribute("data-id");
            if (dataId) {
                const activeTab = document.querySelector(`.layout-tab-container div.protyle[data-id="${dataId}"]`);
                if (activeTab) {
                    const eleTitle = activeTab.querySelector(".protyle-title");
                    let docId = eleTitle?.getAttribute("data-node-id");
                    if (docId) {
                        const block = await getBlockByID(docId);
                        items.push({
                            id: docId,
                            title: (tab.querySelector('span.item__text') as HTMLElement).innerText,
                            description: block.hpath
                        })
                    }
                }
            }
        }
        return items;
    }
};

export {
    FocusDocProvider,
    OpenedDocProvider
};
