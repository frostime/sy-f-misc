/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-12 11:54:23
 * @Description  :
 * @FilePath     : /src/func/gpt/openai/tiny-agent.ts
 * @LastEditTime : 2025-12-12 13:04:45
 */
// import { extractContentText } from '../chat-utils';
import { defaultConfig, defaultModelId, useModel } from '../model';
import { complete } from './complete';

type AgentResult =
    | { ok: true; content: string }
    | { ok: false; error: Error };

export const quickComplete = async (options: {
    systemPrompt: string;
    userPrompt: string;
    completionOptions?: Partial<IChatCompleteOption>;
    model?: ModelBareId;
}): Promise<AgentResult> => {

    const llm = useModel(options.model || defaultConfig().utilityModelId || defaultModelId() || 'siyuan');
    const result = await complete(options.userPrompt, {
        model: llm,
        systemPrompt: options.systemPrompt,
        option: {
            temperature: 0,
            stream: false,
            ...options.completionOptions,
        }
    });

    if (!result || !result.ok) {
        return {
            ok: false,
            error: new Error('Failed to get completion'),
        } satisfies AgentResult;
    }

    // 很奇怪，加了这个会导致 ReferenceError: Cannot access 's3' before initialization
    // const cleanContent = extractContentText(result.content || '');

    return {
        ok: true,
        content: result.content,
    } satisfies AgentResult;

};

/**
 * 渲染模板，支持 {{varName}} 或 {{ varName }} 格式的变量占位符
 */
const renderTemplate = <T extends Record<string, string>>(
    template: string,
    vars: T
): string => {
    // 支持 {{var}} 和 {{ var }} 两种格式
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
        if (!(key in vars)) {
            console.warn(`Missing template variable: ${key}`);
            return match; // 保留原始占位符
        }
        return vars[key];
    });
};

/**
 * 从模板字符串中提取变量名
 */
const extractTemplateVars = (template: string): string[] => {
    const matches = template.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
    return Array.from(new Set(Array.from(matches, m => m[1])));
};

/**
 * 制作一个简易的智能体
 * 
 * @param options 配置选项
 * @param options.inputTemplate 输入模板，支持 {{varName}} 变量占位符
 * @param options.taskRule 任务规则描述，支持 {{varName}} 变量占位符
 * @param options.completionOptions 补全选项
 * @param options.model 模型 ID
 * @param options.outputProcessor 输出处理器
 * 
 * @template T 变量类型，用于类型提示
 * 
 * @example
 * // 创建带类型提示的 agent
 * const agent = makeTinyAgent<{ name: string; age: string }>({
 *     inputTemplate: 'Hello {{name}}, you are {{age}} years old',
 *     taskRule: 'Generate a greeting message'
 * });
 * 
 * // execute 方法的 vars 参数会有类型提示
 * const result = await agent.execute({ name: 'Alice', age: '25' });
 */
export const makeTinyAgent = <T extends Record<string, string> = Record<string, string>>(
    options: {
        inputTemplate: string;
        taskRule?: string;
        completionOptions?: Partial<IChatCompleteOption>;
        model?: ModelBareId;
        outputProcessor?: (output: string) => string;
    }
) => {
    if (!options.inputTemplate) {
        throw new Error('inputTemplate is required when creating agent');
    }

    // 提取所需的变量，用于运行时验证
    const requiredVars = extractTemplateVars(
        [options.inputTemplate, options.taskRule || ''].join(' ')
    );

    const agent = {
        /**
         * 执行智能体任务
         * @param vars 变量对象，用于替换模板中的占位符
         * @returns 执行结果
         */
        execute: async (vars: T): Promise<AgentResult> => {
            // 验证必需的变量
            const missingVars = requiredVars.filter(key => !(key in vars));
            if (missingVars.length > 0) {
                return {
                    ok: false,
                    error: new Error(`Missing required variables: ${missingVars.join(', ')}`),
                } satisfies AgentResult;
            }

            // 渲染输入模板
            const renderedInput = renderTemplate(options.inputTemplate, vars);

            // 构建系统提示
            let systemPrompt = '';
            if (options.taskRule) {
                systemPrompt = renderTemplate(options.taskRule, vars);
            }

            // 调用 quickComplete 函数
            let result = await quickComplete({
                systemPrompt,
                userPrompt: renderedInput,
                completionOptions: options.completionOptions || {},
                model: options.model,
            });

            if (!result.ok) {
                return result;
            }

            // 应用输出处理器
            if (options.outputProcessor) {
                result.content = options.outputProcessor(result.content);
            }

            return result;
        },

        /**
         * 获取智能体配置
         */
        getConfig: () => {
            return {
                inputTemplate: options.inputTemplate,
                taskRule: options.taskRule || '',
                completionOptions: options.completionOptions || {},
                requiredVars,
            };
        }
    };

    return agent;
};

/**
 * 翻译智能体
 * 
 * @param options 翻译选项
 * @param options.text 要翻译的文本
 * @param options.targetLanguage 目标语言，默认为 'Chinese'
 * @param options.sourceLanguage 源语言，可选，不指定则自动检测
 * @param options.model 使用的模型
 * @param options.style 翻译风格：'formal'（正式）、'casual'（口语化）、'technical'（技术）
 * @returns 翻译结果
 */
export const translateAgent = async (options: {
    text: string;
    targetLanguage?: string;
    sourceLanguage?: string;
    model?: ModelBareId;
    style?: 'formal' | 'casual' | 'technical';
}): Promise<AgentResult> => {
    const targetLang = options.targetLanguage || 'Chinese';
    const sourceLang = options.sourceLanguage
        ? `from ${options.sourceLanguage} `
        : '';

    const styleGuide = {
        formal: 'Use formal and polished language.',
        casual: 'Use natural and conversational language.',
        technical: 'Preserve technical terms and maintain precision.',
    }[options.style || 'formal'];

    const systemPrompt = `You are a professional translator. Translate the given text ${sourceLang}to ${targetLang} while:
1. Preserving the original meaning and tone
2. ${styleGuide}
3. Maintaining proper formatting (paragraphs, line breaks, etc.)

Output only the translated text without any explanations, notes, or additional commentary.`;

    const userPrompt = options.text;

    return await quickComplete({
        systemPrompt,
        userPrompt,
        model: options.model,
        completionOptions: {
            temperature: 0.3, // 稍微提高创造性以获得更自然的翻译
            stream: false
        }
    });
};

/**
 * JSON 格式化智能体
 * 
 * @param options JSON 处理选项
 * @param options.text 要格式化或提取的文本
 * @param options.schema 期望的 JSON 结构描述（可选）
 * @param options.model 使用的模型
 * @param options.parseResult 是否尝试解析返回的 JSON，默认为 true
 * @returns 格式化后的 JSON 字符串或解析后的对象
 */
export const jsonAgent = async <T = any>(options: {
    text: string;
    schema?: string;
    model?: ModelBareId;
    parseResult?: boolean;
}): Promise<AgentResult & { parsed?: T }> => {
    const schemaHint = options.schema
        ? `\n\nExpected JSON structure:\n${options.schema}`
        : '';

    const systemPrompt = `You are a JSON extraction and formatting expert.

Task: Convert the given text into valid JSON format. Extract structured information and organize it logically.

Requirements:
1. Output must be valid JSON that can be parsed
2. Use appropriate data types (strings, numbers, booleans, arrays, objects)
3. Use meaningful key names
4. Preserve important information from the original text
5. Remove redundant or irrelevant content${schemaHint}

Output format:
\`\`\`json
{
  "key": "value"
}
\`\`\`

Provide only the JSON output without explanations.`;

    const userPrompt = `Convert the following content to JSON:\n\n${options.text}`;

    const result = await quickComplete({
        systemPrompt,
        userPrompt,
        model: options.model,
        completionOptions: {
            temperature: 0,
            stream: false
        }
    });

    if (!result.ok) {
        return result;
    }

    // 提取 JSON 内容（支持多种格式）
    let jsonContent = result.content;

    // 尝试提取代码块中的 JSON
    const jsonBlockMatch = jsonContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonBlockMatch) {
        jsonContent = jsonBlockMatch[1].trim();
    }

    // 尝试提取自定义标记中的 JSON
    const customTagMatch = jsonContent.match(/<\|JSON\|>\s*\n?([\s\S]*?)\n?<\/\|JSON\|>/);
    if (customTagMatch) {
        jsonContent = customTagMatch[1].trim();
    }

    // 如果需要解析结果
    if (options.parseResult !== false) {
        try {
            const parsed = JSON.parse(jsonContent) as T;
            return {
                ok: true,
                content: jsonContent,
                parsed,
            };
        } catch (error) {
            return {
                ok: false,
                error: new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}\n\nReceived content:\n${jsonContent}`),
            };
        }
    }

    return {
        ok: true,
        content: jsonContent,
    };
};

