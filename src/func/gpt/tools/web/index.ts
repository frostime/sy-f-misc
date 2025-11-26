/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-31 14:51:57
 * @FilePath     : /src/func/gpt/tools/web/index.ts
 * @LastEditTime : 2025-08-03 21:22:05
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
        rulePrompt: `
## 网页检索工具组 ##

**搜索工具选择**:
- TavilySearch: 高质量检索，免费额度充足，复杂查询首选
- BochaSearch: 付费检索，适合中国国内内容
- BingSearch: 免费，适合简单检索

**WebPageContent**: 获取网页内容
- 默认 markdown 模式，移除外链/图片节省空间
- findKeywords 参数：从长网页定位特定内容（优于获取全文）
- raw 模式 + querySelector：提取特定元素

## 使用指南 ##
- 时效性问题必须使用搜索工具，并确认当前日期
- 复杂需求：先搜索获取 URL，再用 WebPageContent 获取详情

## 回答要求 ##
基于网页结果回答时 !IMPORTANT!:
1. 说明使用了网络工具辅助
2. 附注参考 URL 列表: \`1. [网页名称](url)\`
`.trim()
    };

    tools.push(webPageContentTool);
    return group;
}
