/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-31 14:51:57
 * @FilePath     : /src/func/gpt/tools/web/index.ts
 * @LastEditTime : 2025-06-06 22:46:16
 * @Description  : 
 */
import { ToolGroup } from "../types";
import { bingSearchTool } from "./bing";
import { webPageContentTool } from "./webpage";
import { tavilySearchTool } from "./tavily";
import { bochaSearchTool } from "./bocha";
import { globalMiscConfigs } from "../../setting";
// import { semanticScholarSearchTool } from "./sematic-scholar";

export const toolGroupWeb = (): ToolGroup => {
    const tools = [bingSearchTool];

    const tavily = Boolean(globalMiscConfigs().tavilyApiKey);
    const bocha = Boolean(globalMiscConfigs().bochaApiKey);

    if (tavily) {
        tools.push(tavilySearchTool);
    }

    if (bocha) {
        tools.push(bochaSearchTool);
    }

    const group = {
        name: '网页检索工具组',
            tools: tools,
                rulePrompt: `实现一个检索网页内容的工具，支持以下功能：
**搜索工具**：
- BingSearch：完全免费，功能等同于用户在 Bing 搜索页面直接搜索，适合通常的检索任务。
- TavilySearch：每月有一定免费额度，检索质量较高，更倾向于英文网页搜索。
- BochaSearch：每次检索均需付费，开销较大，检索质量较高，可能更适应中国国内的检索。

如果用户未指定偏好，请根据需求自行选择适当的搜索工具。此外 Tavily/Bocha 工具不一定对 ASSISTANT 可用。

**网页内容获取**：
- WebPageContent：获取给定 URL 网页的内容。

**使用场景**：
- 如果用户的提问对时效性有要求，应当使用搜索工具。
- 对于简单的网页检索需求，直接调用搜索工具即可。
- 对于复杂的需求，可以尝试先检索相关网页，然后获取特定网页的内容。

**回答要求**：
当你最后根据网页搜索的结果回答时，请在你的回答中:
1. 说明使用了网络工具来辅助回答。
2. 以参考文献的格式附注参考的网页，使用 Markdown 链接，方便用户直接溯源。
`
    };

    tools.push(webPageContentTool);
    return group;
}
