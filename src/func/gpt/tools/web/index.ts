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

    const webSkillRules = {
        'search-tools': {
            desc: '搜索工具选择与适用场景',
            prompt: `
### 搜索工具选择
- **GoogleSearch**: Google 搜索，提供高质量结果（优先使用 API 模式，回退到抓取模式）
  - 注意：在中国大陆可能因网络限制而无法访问，此时建议使用 BingSearch
  - 支持两种模式：API 模式（需配置 API key）和抓取模式（备用）
  - 优点：搜索质量高，结果权威
  - 缺点：在某些地区可能受限
  - 注: 如果可用，Google 的优先级大于 Bing
- **BingSearch**: 免费搜索，简单快速，可能包含直接回答
  - 适用于需要快速获取信息的场景
  - 稳定性较好，无地区限制
- **TavilySearch**: 高质量检索，包含 AI 摘要答案，复杂查询首选
- **BochaSearch**: 付费检索，适合中国国内内容，支持时间过滤
`.trim()
        },
        'content-tools': {
            desc: '网页内容获取与提取工具对比',
            prompt: `
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
`.trim()
        },
        'workflow-and-notes': {
            desc: '推荐流程、注意事项与回答要求',
            prompt: `
### 推荐工作流程
1. **查找信息**：
   - 优先使用 GoogleSearch (特别是需要高质量检索结果)
   - 如遇访问问题，切换到 BingSearch
   - 对于特定需求，使用 TavilySearch 或 BochaSearch
2. **定位内容**：
   - 知道要找什么 → SearchInWebPage 搜索关键词
   - 要提取特定元素 → ExtractHTML
   - 要阅读全文 → FetchWebPage
3. **精确获取**：根据 SearchInWebPage 的位置信息，用 FetchWebPage 的 begin/limit 精确获取

### 注意事项
- 时效性问题必须使用搜索工具，并确认当前日期
- 长网页优先使用 SearchInWebPage 定位，避免浪费 token
- 需要结构化数据时使用 ExtractHTML
- 默认 FetchWebPage 不保留链接和图片，节省空间；可开启 keepLink 选项，从网页中获取别的相关链接进行深入阅读
- Google 搜索在中国大陆可能无法访问，遇到超时或连接错误时请切换到 Bing 或其他搜索工具

### 回答要求
基于网页结果回答时 !IMPORTANT!:
1. 说明使用了网络工具辅助
2. 附注参考 URL 列表: \`1. [网页名称](url)\`
`.trim()
        }
    } as const;

    const group = {
        name: '网页检索工具组',
        tools: tools,
        rulePrompt: `
- 时效性问题先使用搜索工具，灵活使用 Google/Bing/Tavily/Bocha
- 长网页先 SearchInWebPage 定位，再用 FetchWebPage/ExtractHTML 精取；需要 DOM 结构时用 InspectDOMStructure
- 基于网页回答时需说明使用了网络，并附参考 URL 列表
- 更详尽的工具对比、流程与注意事项见高级文档
`.trim(),
        declareSkillRules: webSkillRules
    };

    // 保留旧的 WebPageContent 工具以保持向后兼容（但不推荐使用）
    // tools.push(webPageContentTool);

    return group;
}
