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
                rulePrompt: `实现一个检索网页内容的工具，支持以下功能：
**搜索工具**
- TavilySearch：每月有一定免费额度，检索质量较高，更倾向于英文网页搜索
- BochaSearch：每次检索均需付费，开销较大，检索质量较高，可能更适应中国国内的检索
- BingSearch：完全免费，功能等同于用户在 Bing 搜索页面直接搜索，适合通常的检索任务

**选择搜索工具**: 如果用户未指定偏好，请根据需求自行选择适当的搜索工具
- 复杂查询优先使用 TavilySearch/BochaSearch
- 使用 Bing 时仔细设计 query; 或有效利用工具的其他过滤参数
- Tavily/BochaSearch: 支持复杂的参数, 请根据用户理解仔细思考查询需求并配置参数; 适合比较复杂的检索需求
- Tavily 通常免费额度足够，不需要考虑节省; 所以不用为了节省而不用它

**网页内容获取工具**：WebPageContent 强大的URL内容解析工具
- 支持两种模式：markdown模式（默认，将HTML解析为Markdown）和raw模式（返回原始HTML结构）
- 默认移除所有外链和图片以节省空间
    - 所有链接会被简化为 "(URL链接: anchor-text)"
    - 如需想要查看具体的链接内容，可以设置 keepLink=true
- 支持CSS选择器（raw模式）：可通过querySelector参数指定要提取的页面元素
- **关键词查找功能**：提供findKeywords参数可查找包含特定关键词的内容块
  * 支持AND/OR连接方式
  * 返回匹配统计和具体匹配内容，包含上下文信息
- 支持内容截取：通过begin和limit参数控制返回内容的范围
- 自动处理各种内容类型：HTML、JSON、纯文本等

**使用指导**
- 如果用户的提问对时效性有要求，应当使用搜索工具。并且关注当前的日期时间以确保事实性
- 简单检索需求: 直接调用搜索工具即可
- 复杂检索需求: 可以使用搜索工具检索相关URL，然后获取特定网页的内容
- 当需要从长网页中查找特定信息时，优先使用关键词查找功能而非获取完整内容
- 对于结构化数据提取，可使用raw模式配合CSS选择器

**通用参数**
- 所有工具都支持可选的 \`limit\` 参数（数字类型）来控制返回给 LLM 的输出长度，默认约 8000 字符。设置为 -1 或 0 表示不限制。

**回答要求**
当你最后根据网页搜索的结果回答时，请在你的回答中:
1. 说明使用了网络工具来辅助回答。
2. 附注参考的网页URL, 方便用户直接溯源，尽可能将用到的引用全都列举出来; 格式为 Markdown 的有序列表: 1. [网页名称](url)
`
    };

    tools.push(webPageContentTool);
    return group;
}
