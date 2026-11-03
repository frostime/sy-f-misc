/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-31 14:51:57
 * @FilePath     : /src/func/gpt/tools/web/index.ts
 * @LastEditTime : 2026-02-25 19:28:54
 * @Description  : Web 工具组 - 网页搜索和内容获取
 */
import { ToolGroup } from "../types";
import { bingSearchTool } from "./bing";
import { googleSearchTool } from "./google";
// import { webPageContentTool } from "./webpage";
import { tavilySearchTool } from "./tavily";
import { bochaSearchTool } from "./bocha";
import { fetchWebPageTool } from "./fetch-webpage";
import { extractHTMLTool, inspectDOMStructureTool } from "./extract-html";
import { searchInWebPageTool } from "./search-in-webpage";
import { globalMiscConfigs } from "../../setting";
// import { semanticScholarSearchTool } from "./sematic-scholar";

export const toolGroupWeb = (): ToolGroup => {
    // 基础工具：搜索 + 三个网页内容工具
    const tavily = Boolean(globalMiscConfigs().tavilyApiKey);
    const bocha = Boolean(globalMiscConfigs().bochaApiKey);
    const google = Boolean(globalMiscConfigs().googleApiKey) || true; // Google 支持无 API key 的抓取模式

    const tools = [bingSearchTool, fetchWebPageTool, searchInWebPageTool, extractHTMLTool, inspectDOMStructureTool];


    if (google) {
        tools.push(googleSearchTool);
    }

    if (tavily) {
        tools.push(tavilySearchTool);
    }

    if (bocha) {
        tools.push(bochaSearchTool);
    }

    const group = {
        name: '网页检索工具组',
        tools: tools,
        // 各工具的用途与参数已在工具定义中；此处只写跨工具的差异与回答要求
        rulePrompt: `
- 需要时效性信息时先搜索，并确认当前日期
- 搜索工具差异：Google 质量高但在中国大陆可能不可达（可用时优先）；Bing 免费快速；Tavily 带 AI 摘要，复杂查询首选；Bocha 适合国内内容
- 长网页先用 SearchInWebPage 定位段落，再用 FetchWebPage 的 begin/limit 或 ExtractHTML 精取；不确定页面结构时先 InspectDOMStructure
- 基于网页回答时需说明使用了网络工具，并附参考列表：\`1. [网页名称](url)\`
`.trim()
    };

    // 保留旧的 WebPageContent 工具以保持向后兼容（但不推荐使用）
    // tools.push(webPageContentTool);

    return group;
}
