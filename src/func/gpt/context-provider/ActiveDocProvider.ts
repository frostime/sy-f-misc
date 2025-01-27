/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:32:00
 * @FilePath     : /src/func/gpt/context-provider/ActiveDocProvider.ts
 * @LastEditTime : 2025-01-27 15:24:23
 * @Description  : 
 */
import { getMarkdown } from "@frostime/siyuan-plugin-kits";
import { getBlockByID } from "@frostime/siyuan-plugin-kits/api";


const ActiveDocProvider: CustomContextProvider = {
    name: "ActiveDoc",
    displayTitle: "当前文档",
    description: "当前的思源文档",
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

export default ActiveDocProvider;
