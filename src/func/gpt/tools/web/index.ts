import { ToolGroup } from "../types";
import { bingSearchTool } from "./bing";
import { webPageContentTool } from "./webpage";
import { tavilySearchTool } from "./tavily";
import { bochaSearchTool } from "./bocha";
import { globalMiscConfigs } from "../../setting";

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
                rulePrompt: `实现检索网页内容相关的工具
${tools.map(tool => tool.definition.function.name).join('/')} 返回搜索得到的网页链接和简单的描述
WebPageContent 获取给定 URL 网页的内容

BingSearch 完全免费，基本等同于用户在 Bing 搜索页面直接搜索，适合基本的检索任务
${tavily ? 'TavilySearch 每月有一定免费额度, 检索质量相对较高, 更倾向对英文网页进行搜索' : ''}
${bocha ? 'BochaSearch 每次检索均需要付费，比 Tavily 开销更大；检索质量相对较高，且可能更适应中国国内的检索' : ''}
如果用户没有指定的偏好，请自行衡量选择适当的搜索工具.

对于简单网页检索需求，调用搜索即可
对于复杂的需求，可以尝试先检索相关网页然后获取特定网页的内容

当你最后根据网页搜索的结果回答时，请在你的回答中:
1. 说明自己使用了网络工具来辅助回答
2. 以参考文献的格式附注你参考的网页, 使用 Markdown 链接，以方便用户直接溯源
`
    };

    tools.push(webPageContentTool);
    return group;
}
