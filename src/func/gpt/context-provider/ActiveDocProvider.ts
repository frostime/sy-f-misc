/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:32:00
 * @FilePath     : /src/func/gpt/context-provider/ActiveDocProvider.ts
 * @LastEditTime : 2025-01-26 22:42:56
 * @Description  : 
 */
import { getMarkdown } from "@frostime/siyuan-plugin-kits";
import { getBlockByID } from "@frostime/siyuan-plugin-kits/api";


const ActiveDocProvider: CustomContextProvider = {
    name: "ActiveDoc",
    displayTitle: "当前文档",
    description: "当前的思源文档",
    getContextItems: async (options?: any): Promise<ContextItem[]> => {
        let tabs: NodeListOf<HTMLElement> = document.querySelectorAll(".layout-tab-container.fn__flex-1>div.protyle");
        if (tabs.length === 0) {
            return [];
        }
        const parseTab = async (tab: HTMLElement) => {
            let dataId = tab?.getAttribute("data-id");
            if (!dataId) {
                return null;
            }
            const activeTab = document.querySelector(`.layout-tab-container.fn__flex-1>div.protyle[data-id="${dataId}"]`);
            if (!activeTab) {
                return;
            }
            const eleTitle = activeTab.querySelector(".protyle-title");
            let docId = eleTitle?.getAttribute("data-node-id");


            if (!docId) {
                return null;
            }
            const doc = await getBlockByID(docId);
            const content = await getMarkdown(docId);
            return  {
                name: doc.content,
                description: `文档: ${doc.hpath}`,
                content: content,
            };
        }
        let contextItems: ContextItem[] = [];
        for (const tab of tabs) {
            let contextItem = await parseTab(tab);
            if (contextItem) {
                contextItems.push(contextItem);
            }
        }
        return contextItems;
    },
};

export default ActiveDocProvider;
