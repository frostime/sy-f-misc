/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-31 14:51:57
 * @FilePath     : /src/func/gpt/tools/web/index.ts
 * @LastEditTime : 2025-12-16 15:48:01
 * @Description  : Web 工具组 - 网页搜索和内容获取
 */
import { ToolGroup } from "../types";
import { bingSearchTool } from "./bing";
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
    const tools = [bingSearchTool, fetchWebPageTool, searchInWebPageTool, extractHTMLTool, inspectDOMStructureTool];

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

### 搜索工具选择
- **TavilySearch**: 高质量检索，包含 AI 摘要答案，复杂查询首选
- **BochaSearch**: 付费检索，适合中国国内内容，支持时间过滤
- **BingSearch**: 免费搜索，简单快速，可能包含直接回答

### 网页内容获取工具（按使用场景选择）

1. **FetchWebPage** - 基础网页获取
   - 用途：获取网页并转换为 Markdown 格式
   - 适用场景：阅读文章、获取网页主要内容
   - 特性：支持分页（begin/limit）、可选保留链接和图片

2. **SearchInWebPage** - 网页内关键词搜索
   - 用途：在网页中搜索特定关键词，返回匹配段落
   - 适用场景：长网页快速定位内容，避免获取全文
   - 特性：返回段落位置信息，可配合 FetchWebPage 精确获取

3. **ExtractHTML** - 提取特定 HTML 元素
   - 用途：使用 CSS 选择器精确提取网页元素
   - 适用场景：提取表格、列表、特定区块等结构化内容
   - 特性：返回原始 HTML 和纯文本

4. **InspectDOMStructure** - 检查网页 DOM 结构
   - 用途：分析网页 DOM，辅助编写 CSS 选择器
   - 适用场景：需要提取位置网页的 HTML 结构，可以在前期用这个调研
   - 特性：返回 DOM 树结构和元素信息

### 推荐工作流程
1. **查找信息**：先用搜索工具获取相关 URL
2. **定位内容**：
   - 知道要找什么 → SearchInWebPage 搜索关键词
   - 要提取特定元素 → ExtractHTML
   - 要阅读全文 → FetchWebPage
3. **精确获取**：根据 SearchInWebPage 的位置信息，用 FetchWebPage 的 begin/limit 精确获取

### 注意事项
- 时效性问题必须使用搜索工具，并确认当前日期
- 长网页优先使用 SearchInWebPage 定位，避免浪费 token
- 需要结构化数据时使用 ExtractHTML
- 默认 FetchWebPage 不保留链接和图片，节省空间；可开启keepLink选项，从网页中获取别的相关链接进行深入阅读

## 回答要求 ##
基于网页结果回答时 !IMPORTANT!:
1. 说明使用了网络工具辅助
2. 附注参考 URL 列表: \`1. [网页名称](url)\`
`.trim()
    };

    // 保留旧的 WebPageContent 工具以保持向后兼容（但不推荐使用）
    // tools.push(webPageContentTool);

    return group;
}
