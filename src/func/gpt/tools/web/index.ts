import { ToolGroup } from "../types";
import { bingSearchTool } from "./bing";
import { webPageContentTool } from "./webpage";
import { tavilySearchTool } from "./tavily";
import { globalMiscConfigs } from "../../setting";

export const toolGroupWeb = (): ToolGroup => {
    const isApiKeyValid = globalMiscConfigs().tavilyApiKey;

    const tools = [webPageContentTool, bingSearchTool];
    if (isApiKeyValid) {
        tools.push(tavilySearchTool);
    }

    const group = {
        name: 'web-tools',
            tools: tools,
                rulePrompt: `实现检索网页内容相关的工具
${isApiKeyValid ? "BingSearch/TavilySearch" : "BingSearch"} 返回搜索得到的网页链接和简单的描述
WebPageContent 获取给定 URL 网页的内容

${isApiKeyValid ? "" : `
BingSearch 完全免费，适合基本的检索任务
TavilySearch 依赖于 Tavily API 服务，需要付费使用
如果用户没有指定的偏好，请自行衡量选择适当的搜索工具
`.trim()}

对于简单网页检索需求，调用搜索即可
对于复杂的需求，可以尝试先检索相关网页然后获取特定网页的内容

当你最后根据网页搜索的结果回答时，请在你的回答中标注:
1. 你使用了工具来辅助回答
2. 以参考文献的格式附注你参考的网页, 使用 Markdown 链接
`
    };
    return group;
}
