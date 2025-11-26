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
    'api-reference': `
## ToolCallScript API 参考 ##

在沙箱环境中可用的全局函数：

### 1. TOOL_CALL
\`await TOOL_CALL(toolName: string, args: object): Promise<any>\`
- **功能**: 调用注册的工具。
- **返回**: 工具执行的原始结果 (data)。注意这不是最终给 LLM 的文本，而是结构化数据（如果工具支持）。
- **示例**:
  \`\`\`javascript
  const files = await TOOL_CALL('ListFiles', { path: '/data' });
  \`\`\`

### 2. FORMALIZE
\`await FORMALIZE(text: string, typeDescription: string): Promise<any>\`
- **功能**: 使用 LLM 将非结构化文本转换为 JSON 对象。
- **参数**:
  - \`text\`: 需要解析的文本。
  - \`typeDescription\`: TypeScript 类型定义描述，指导 LLM 如何提取数据。
- **限制**: 输入文本最大 32000 字符。
- **示例**:
  \`\`\`javascript
  const data = await FORMALIZE(rawText, '{ name: string, age: number }[]');
  \`\`\`

### 3. PARALLEL
\`await PARALLEL(...promises: Promise<any>[]): Promise<any[]>\`
- **功能**: 并行执行多个 Promise。
- **示例**:
  \`\`\`javascript
  const [res1, res2] = await PARALLEL(
      TOOL_CALL('ToolA', {}),
      TOOL_CALL('ToolB', {})
  );
  \`\`\`

### 4. SLEEP
\`await SLEEP(ms: number): Promise<void>\`
- **功能**: 暂停执行指定毫秒数。

### 5. Console
\`console.log(msg)\`, \`console.warn(msg)\`, \`console.error(msg)\`
- **功能**: 记录输出。所有日志将作为工具的最终返回结果。
`.trim(),

    'best-practices': `
## 最佳实践 ##

1. **始终使用 await**: 所有 API (TOOL_CALL, FORMALIZE, SLEEP, PARALLEL) 都是异步的，必须使用 \`await\`，否则脚本会立即结束或报错。

2. **错误处理**: 使用 \`try-catch\` 块包裹可能失败的工具调用，以确保脚本不会因单个错误而完全崩溃。
   \`\`\`javascript
   try {
       await TOOL_CALL('RiskyTool', {});
   } catch (e) {
       console.error('Tool failed:', e);
   }
   \`\`\`

3. **避免 JSON 语法错误**:
   - 脚本是作为 JSON 字符串传递的。
   - 优先使用单引号 \`'\` 定义字符串。
   - 如果必须使用双引号或反斜杠，请使用转义符: \`_esc_dquote_\` (") 和 \`_esc_backslash_\` (\\)。

4. **FORMALIZE 的高效使用**:
   - 不要对每条小数据单独调用 FORMALIZE，这很慢且昂贵。
   - 尽量聚合数据后一次性调用 FORMALIZE。
   - \`typeDescription\` 要尽可能精确，包含注释以指导提取逻辑。

5. **Limit 参数**:
   - 许多工具（如搜索、文件读取）有 \`limit\` 参数。
   - 在脚本中处理数据时，通常希望获取完整数据，因此建议设置 \`limit: -1\`。
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
