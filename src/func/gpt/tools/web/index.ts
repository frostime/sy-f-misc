import { ToolGroup } from "../types";
import { bingSearchTool } from "./bing";
import { webPageContentTool } from "./webpage";

export const toolGroupWeb: ToolGroup = {
    name: 'web-tools',
    tools: [webPageContentTool, bingSearchTool],
    rulePrompt: `实现检索网页内容相关的工具
BingSearch 返回搜索得到的网页链接和简单的描述, WebPageContent 获取给定 URL 的内容
对于简单网页检索需求，调用搜索即可
对于复杂的需求，可以尝试先检索相关网页然后获取特定网页的内容

当你最后根据网页搜索的结果回答时，请在你的回答中标注:
1. 你使用了工具来辅助回答
2. 以参考文献的格式附注你参考的网页, 使用 Markdown 链接
`
};
