/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-31 14:51:57
 * @FilePath     : /src/func/gpt/tools/web/index.ts
 * @LastEditTime : 2025-06-14 21:27:43
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

Bing: 使用 Bing 时仔细设计 query, 多利用关键词组合, 复杂的 OR AND NOT () site: language: 等运算符
Tavily/Bocha: 支持复杂的参数, 请根据用户理解仔细思考查询需求并配置参数

**网页内容获取工具**：WebPageContent 一个强大的网络链接内容解析工具。
- 适配网页、返回 JSON 等纯文本情况; 默认会将 HTML 内容解析为 Markdown
- 默认去掉所有 URL 外链和图片，如果有基于网页进行爬虫式抓取的需求，可设 keepLink=true

**使用指导**：
- 如果用户的提问对时效性有要求，应当使用搜索工具。并且关注当前的日期时间以确保事实性。
- 简单检索需求: 直接调用搜索工具即可。
- 复杂检索需求: 可以使用搜索工具检索相关URL，然后获取特定网页的内容。

**回答要求**：
当你最后根据网页搜索的结果回答时，请在你的回答中:
1. 说明使用了网络工具来辅助回答。
2. 以参考文献的格式附注参考的网页，使用 Markdown 链接，方便用户直接溯源。
`
    };

    tools.push(webPageContentTool);
    return group;
}
