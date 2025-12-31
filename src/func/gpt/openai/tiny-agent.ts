/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-12 11:54:23
 * @Description  :
 * @FilePath     : /src/func/gpt/openai/tiny-agent.ts
 * @LastEditTime : 2025-12-31 13:54:33
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


// ================================================================
// 委员会模式
// ================================================================
// tiny-agent.ts

/**
 * 辩论模式：提出者-挑战者往复改进
 */
export const makeDebateAgent = (options: {
    proposer: ModelBareId;
    challenger: ModelBareId;
    rounds?: number;
    taskRule?: string;
    initialHistory?: IMessage[];
    completionOptions?: Partial<IChatCompleteOption>;
}) => {
    const maxRounds = options.rounds || 3;

    return {
        execute: async (userPrompt: string): Promise<{
            ok: boolean;
            content: string;
            error?: Error;
            debateHistory?: IMessage[];
        }> => {
            const proposerLLM = useModel(options.proposer);
            const challengerLLM = useModel(options.challenger);

            if (!proposerLLM || !challengerLLM) {
                return {
                    ok: false,
                    content: '',
                    error: new Error('模型配置无效')
                };
            }

            // 初始化消息历史
            const messages: IMessage[] = [
                ...(options.initialHistory || []),
                { role: 'user', content: userPrompt }
            ];

            // === 第一轮：提出者初始回答 ===
            let result = await complete(messages, {
                model: proposerLLM,
                systemPrompt: options.taskRule,
                stream: false,
                option: {
                    temperature: 0.7,
                    ...options.completionOptions
                }
            });

            if (!result.ok) {
                return { ok: false, content: result.content, error: new Error(result.content) };
            }

            messages.push({
                role: 'assistant',
                content: result.content,
                name: options.proposer
            });

            let currentAnswer = result.content;

            // === 后续轮次：挑战-改进循环 ===
            for (let i = 0; i < maxRounds - 1; i++) {
                // 挑战者批评
                const challengeMessages: IMessage[] = [
                    ...messages,
                    {
                        role: 'user',
                        content: '请指出上述回答的问题：\n1. 逻辑漏洞\n2. 事实错误\n3. 论证不足\n提供具体改进建议。'
                    }
                ];

                const challengeResult = await complete(challengeMessages, {
                    model: challengerLLM,
                    systemPrompt: '你是严格的批评者，擅长发现论证缺陷。',
                    stream: false,
                    option: {
                        temperature: 0.5,
                        ...options.completionOptions
                    }
                });

                if (!challengeResult.ok) break;

                messages.push({
                    role: 'assistant',
                    content: challengeResult.content,
                    name: options.challenger
                });

                messages.push({
                    role: 'user',
                    content: '请根据批评意见改进你的回答。'
                });

                // 提出者改进
                const improveResult = await complete(messages, {
                    model: proposerLLM,
                    systemPrompt: options.taskRule + '\n注意吸收批评中的合理建议。',
                    stream: false,
                    option: {
                        temperature: 0.7,
                        ...options.completionOptions
                    }
                });

                if (!improveResult.ok) break;

                currentAnswer = improveResult.content;
                messages.push({
                    role: 'assistant',
                    content: currentAnswer,
                    name: options.proposer
                });
            }

            return {
                ok: true,
                content: currentAnswer,
                debateHistory: messages
            };
        }
    };
};

/**
 * 并行评审模式：多模型独立思考后交叉评审
 */
export const makeEnsembleAgent = (options: {
    models: ModelBareId[];
    consolidator?: ModelBareId;
    taskRule?: string;
    initialHistory?: IMessage[];
    completionOptions?: Partial<IChatCompleteOption>;
}) => {
    return {
        execute: async (userPrompt: string): Promise<{
            ok: boolean;
            content: string;
            error?: Error;
            individualAnswers?: Array<{ model: string; content: string }>;
            reviews?: string[];
        }> => {
            const baseMessages: IMessage[] = [
                ...(options.initialHistory || []),
                { role: 'user', content: userPrompt }
            ];

            // === 阶段 1：并行生成初始回答 ===
            const modelLLMs = options.models.map(id => ({
                id,
                llm: useModel(id)
            }));

            if (modelLLMs.some(m => !m.llm)) {
                return {
                    ok: false,
                    content: '',
                    error: new Error('部分模型配置无效')
                };
            }

            const initialAnswers = await Promise.all(
                modelLLMs.map(async ({ id, llm }) => {
                    const result = await complete(baseMessages, {
                        model: llm,
                        systemPrompt: options.taskRule,
                        stream: false,
                        option: {
                            temperature: 0.7,
                            ...options.completionOptions
                        }
                    });
                    return { modelId: id, result };
                })
            );

            const failed = initialAnswers.find(({ result }) => !result.ok);
            if (failed) {
                return {
                    ok: false,
                    content: failed.result.content,
                    error: new Error(failed.result.content)
                };
            }

            // === 阶段 2：交叉评审 ===
            const reviews: string[] = [];

            for (let i = 0; i < modelLLMs.length; i++) {
                const { id, llm } = modelLLMs[i];
                const myAnswer = initialAnswers[i].result.content;
                const othersText = initialAnswers
                    .filter((_, idx) => idx !== i)
                    .map(({ modelId, result }) =>
                        `### ${modelId}\n${result.content}`
                    )
                    .join('\n\n');

                const reviewMessages: IMessage[] = [
                    ...baseMessages,
                    { role: 'assistant', content: myAnswer, name: id },
                    {
                        role: 'user',
                        content: `其他模型的回答：\n\n${othersText}\n\n请对比分析各回答的优缺点，并指出你的回答可以如何改进。`
                    }
                ];

                const reviewResult = await complete(reviewMessages, {
                    model: llm,
                    systemPrompt: '你需要客观评价不同回答的优劣。',
                    stream: false,
                    option: {
                        temperature: 0.3,
                        ...options.completionOptions
                    }
                });

                if (reviewResult.ok) {
                    reviews.push(reviewResult.content);
                }
            }

            // === 阶段 3：综合整合 ===
            const consolidatorId = options.consolidator || options.models[0];
            const consolidatorLLM = useModel(consolidatorId);

            if (!consolidatorLLM) {
                return {
                    ok: false,
                    content: '',
                    error: new Error('综合者模型配置无效')
                };
            }

            const synthesisText = initialAnswers.map(({ modelId, result }, i) =>
                `## ${modelId} 的回答\n${result.content}\n\n### 对应评审\n${reviews[i] || '无'}`
            ).join('\n\n---\n\n');

            const consolidationMessages: IMessage[] = [
                ...baseMessages,
                {
                    role: 'user',
                    content: `以下是多个模型的回答及评审：\n\n${synthesisText}\n\n请综合优点、规避缺陷，给出最优答案。`
                }
            ];

            const finalResult = await complete(consolidationMessages, {
                model: consolidatorLLM,
                systemPrompt: options.taskRule + '\n你需要提炼集体智慧。',
                stream: false,
                option: {
                    temperature: 0.5,
                    ...options.completionOptions
                }
            });

            return {
                ok: finalResult.ok,
                content: finalResult.content,
                error: finalResult.ok ? undefined : new Error(finalResult.content),
                individualAnswers: initialAnswers.map(({ modelId, result }) => ({
                    model: modelId,
                    content: result.content
                })),
                reviews
            };
        }
    };
};


