/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-26
 * @FilePath     : /src/func/gpt/tools/toolcall-script/skill-doc.ts
 * @Description  : ToolCallScript 技能文档查询工具
 */

import { Tool, ToolExecuteStatus, ToolPermissionLevel, ToolExecuteResult } from "../types";

/**
 * 技能文档主题定义
 */
const SKILL_DOCS: Record<string, string> = {

    'data-format-reference': `
## TOOL_CALL 返回数据说明 ##

**核心差异**: 
- **Chat 对话中**: 工具返回结果通常是经过格式化（Format）和截断（Truncate）的**字符串**，为了方便 LLM 阅读。
- **脚本 TOOL_CALL 中**: 你拿到的是工具返回的**原始数据，不一定是字符串（Raw Data）。

**常见误区**:
不要假设 TOOL_CALL 返回的是你在对话中看到的 Markdown 文本。
例如，搜索工具在对话中显示为 Markdown 列表，但在脚本中返回的是 \`{ title: string, url: string, content: string }[]\` 数组。

**如何获取正确结构**:
1. **首选**: 使用 \`CheckToolReturnType\` 工具查询目标工具的返回类型定义。
2. **备选**: 如果没有定义类型，编写一个简单的探测脚本：
   \`\`\`javascript
   const res = await TOOL_CALL('TargetTool', { ...args });
   console.log(JSON.stringify(res, null, 2)); // 打印完整结构
   \`\`\`
`.trim(),

    'best-practices': `
## 最佳实践 ##

### 1. 🛑 必须先检查返回类型 (CRITICAL)
**不要猜测工具返回的数据结构！**
在编写脚本之前，**必须**先调用 \`CheckToolReturnType\` 查看你要调用的工具返回什么数据类型。
- 如果你假设它返回字符串，但它返回对象，脚本会崩溃。
- 如果你假设字段名是 \`content\` 但其实是 \`body\`，脚本会失败。

### 2. 🛡️ 防御性编程
工具调用可能会失败，或者返回空数据。
\`\`\`javascript
try {
    const data = await TOOL_CALL('SomeTool', {});
    if (!data) {
        console.warn('No data returned');
        return;
    }
    // ... process data
} catch (e) {
    console.error('Tool execution failed:', e.message);
}
\`\`\`

### 3. ⚡ 性能优化
- **FORMALIZE 是昂贵的**: 不要对循环中的每一项调用 FORMALIZE。先收集所有文本，合并后一次性调用，或者只处理前几项。
- **Limit 参数**: 调用搜索或读取文件工具时，通常设置 \`limit: -1\` 以获取完整数据供脚本处理。

### 4. 📝 调试技巧
如果不确定脚本逻辑是否正确，先写一个只包含 \`console.log\` 的脚本来验证假设。
`.trim(),

    'example-basic': `
## 基础示例 ##

### 场景: 读取文件并统计行数

\`\`\`javascript
// 1. 读取文件内容
const content = await TOOL_CALL('ReadFile', { 
    path: '/home/user/data.txt',
    limit: -1 // 获取完整内容
});

// 2. 简单的逻辑处理
const lines = content.split('\\n');
const lineCount = lines.length;

// 3. 输出结果
console.log('File line count:', lineCount);

if (lineCount > 1000) {
    console.warn('File is very large!');
}
\`\`\`
`.trim(),

    'example-formalize': `
## FORMALIZE 示例 ##

### 场景: 从非结构化日志中提取错误信息

\`\`\`javascript
const rawLog = \`
[2023-10-01 10:00:01] INFO: System started
[2023-10-01 10:00:05] ERROR: Connection failed (Code 500)
[2023-10-01 10:00:10] WARN: High memory usage
\`;

// 定义目标结构
const typeDesc = \`
{
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
}[]
\`;

// 执行提取
const logs = await FORMALIZE(rawLog, typeDesc);

// 处理提取后的数据
const errors = logs.filter(l => l.level === 'ERROR');
console.log('Found errors:', JSON.stringify(errors, null, 2));
\`\`\`
`.trim(),

    'example-parallel': `
## 并行执行示例 ##

### 场景: 同时搜索两个关键词并合并结果

\`\`\`javascript
const keywords = ['AI Agents', 'LLM Tool Use'];

// 并行发起搜索请求
const results = await PARALLEL(
    TOOL_CALL('TavilySearch', { query: keywords[0] }),
    TOOL_CALL('TavilySearch', { query: keywords[1] })
);

// results[0] 是第一个关键词的结果
// results[1] 是第二个关键词的结果

console.log('Search 1 results:', results[0].length);
console.log('Search 2 results:', results[1].length);

// 合并处理...
\`\`\`
`.trim(),

    'example-complex': `
## 复杂编排示例 ##

### 场景: 搜索网页 -> 获取内容 -> 提取特定信息

\`\`\`javascript
// 1. 搜索相关网页
const searchRes = await TOOL_CALL('TavilySearch', { 
    query: 'latest typescript features',
    limit: 3 
});

// 假设 searchRes 是 [{ url: '...', title: '...' }, ...]

// 2. 遍历结果获取详情
for (const item of searchRes) {
    console.log(\`Processing: \${item.title}\`);
    
    try {
        // 获取网页内容
        const content = await TOOL_CALL('WebPageContent', { 
            url: item.url,
            limit: 5000 // 限制长度避免上下文溢出
        });
        
        // 3. 提取关键点 (使用 FORMALIZE)
        const features = await FORMALIZE(content, \`
            // Extract list of features mentioned
            string[]
        \`);
        
        console.log(\`Features in \${item.url}:\`, features);
        
    } catch (e) {
        console.error(\`Failed to process \${item.url}: \${e.message}\`);
    }
}
\`\`\`
`.trim()
};

/**
 * 获取所有可用主题
 */
const getAvailableTopics = (): string[] => Object.keys(SKILL_DOCS);

/**
 * ToolCallScript 技能文档查询工具
 */
export const toolCallScriptDocTool: Tool = {

    SKIP_CACHE_RESULT: true,
    SKIP_EXTERNAL_TRUNCATE: true,

    definition: {
        type: 'function',
        function: {
            name: 'ToolCallScriptDoc',
            description: `查询 ToolCallScript 的使用文档、API 参考和代码示例。
当需要编写复杂脚本或不确定 API 用法时调用。
可用主题: ${getAvailableTopics().join(', ')}
返回 \`string\`（Markdown 格式文档）`,
            parameters: {
                type: 'object',
                properties: {
                    topics: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: getAvailableTopics()
                        },
                        description: '要查询的主题列表'
                    }
                },
                required: ['topics']
            }
        },
        permissionLevel: ToolPermissionLevel.PUBLIC
    },

    execute: async (args: { topics: string[] }): Promise<ToolExecuteResult> => {
        const { topics } = args;

        if (!topics || topics.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `请指定要查询的主题。可用主题: ${getAvailableTopics().join(', ')}`
            };
        }

        const results: string[] = [];
        const notFound: string[] = [];

        for (const topic of topics) {
            if (SKILL_DOCS[topic]) {
                results.push(SKILL_DOCS[topic]);
            } else {
                notFound.push(topic);
            }
        }

        if (results.length === 0) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `未找到主题: ${notFound.join(', ')}。可用主题: ${getAvailableTopics().join(', ')}`
            };
        }

        let output = results.join('\n\n---\n\n');

        if (notFound.length > 0) {
            output += `\n\n[注意] 未找到主题: ${notFound.join(', ')}`;
        }

        return {
            status: ToolExecuteStatus.SUCCESS,
            data: output
        };
    },

    // 参数压缩显示
    compressArgs: (args: Record<string, any>) => {
        return `topics: [${args.topics?.join(', ') || ''}]`;
    }
};
