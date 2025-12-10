import { deepMerge } from "@frostime/siyuan-plugin-kits";

/**
 * 预设配置接口
 * 不需要包含所有字段，只需要包含该类模型的"特征"
 */
interface IModelPreset {
    keywords: (string | RegExp)[]; // 匹配关键词，支持字符串或正则
    config: Partial<Omit<ILLMConfigV2, 'model' | 'displayName'>>;
}

// 兜底通用配置
const DEFAULT_CHAT_CONFIG: ILLMConfigV2 = {
    model: 'model-placeholder',
    type: 'chat',
    modalities: { input: ['text'], output: ['text'] },
    capabilities: { tools: true, streaming: true },
    limits: { },
    options: {
        customOverride: {},
        unsupported: []
    },
};

/**
 * 根据模型名称，自动应用预设并生成配置
 * @param modelName 用户输入的模型 ID，如 "gpt-4o-2024-05-13"
 * @param manualConfig 用户手动指定的配置（如果有，优先级最高）
 */
export function createModelConfig(
    modelName: string,
): ILLMConfigV2 {
    // 1. 寻找匹配的预设
    const matchedPreset = MODEL_PRESETS.find(preset => {
        return preset.keywords.some(keyword => {
            if (keyword instanceof RegExp) {
                return keyword.test(modelName);
            }
            return modelName.includes(keyword);
        });
    });

    // 2. 合并配置：DEFAULT_CHAT_CONFIG -> matchedPreset.config -> { model, displayName }
    const mergedConfig = deepMerge(DEFAULT_CHAT_CONFIG, matchedPreset?.config || {});
    const finalConfig = deepMerge(mergedConfig, {
        model: modelName,
        displayName: modelName,
    });

    return finalConfig;
}


/**
 * 常用模型预设（按优先级排序：越具体越靠前）
 *
 * 注意：
 * - 真正的上下文长度 / 价格以各家官方文档为准
 * - 这里的数字是“安全的近似值 + 上限提示”，仅做 UI / 提示用途
 */
const MODEL_PRESETS: IModelPreset[] = [
    // ===========================
    // OpenAI GPT-5.1 / GPT-5 系列
    // ===========================
    {
        // 例如：gpt-5.1, gpt-5.1-chat, gpt-5.1-thinking
        keywords: [/^gpt-5\.1\b/i, /gpt-5\.1-/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true, // 支持 reasoning_effort 等配置
                jsonMode: true,
            },
            limits: {
                // 官方文档与三方测评普遍给出 400K 上下文量级
                maxContext: 400_000,
                maxOutput: 128_000,
            },
            options: {
                customOverride: {
                    // 给出一个常用的默认值示例，使用方可以再覆盖
                    // reasoning_effort: 'medium',
                },
            },
        },
    },
    {
        // gpt-5 主系列（不含 5.1），包括 gpt-5, gpt-5-mini, gpt-5-nano 等
        keywords: [/^gpt-5\b/i, /gpt-5-(mini|nano|instant)/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            limits: {
                maxContext: 400_000,
                maxOutput: 64_000,
            },
        },
    },

    // 兼容老的 gpt-4o / gpt-4.1 之类的名称
    {
        keywords: [/gpt-4o/i, /gpt-4\.1/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            limits: {
                maxContext: 128_000,
                maxOutput: 16_000,
            },
        },
    },

    // ================
    // Anthropic Claude
    // ================
    {
        // Claude 4.5 全家（Opus / Sonnet / Haiku）
        keywords: [/claude-4\.5/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true, // 4.5 系列是混合推理模型，带 thinking token
                jsonMode: false,
            },
            limits: {
                // Sonnet 4 / 4.5 支持 1M context（部分平台默认 200k，可额外开 1M）
                maxContext: 1_000_000,
                maxOutput: 8_000,
            },
            options: {
                // Claude API 不支持 frequency_penalty / presence_penalty 等 OpenAI 特有参数
                unsupported: ['frequency_penalty', 'presence_penalty'],
            },
        },
    },
    {
        // Claude 4 系列（Opus 4 / Sonnet 4 / Haiku 4）
        keywords: [/claude-4\b/i, /claude-4-(opus|sonnet|haiku)/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
            },
            limits: {
                maxContext: 1_000_000, // Sonnet 4 已扩展到 1M
                maxOutput: 8_000,
            },
            options: {
                unsupported: ['frequency_penalty', 'presence_penalty'],
            },
        },
    },
    {
        // 兜底：任何 claude-*
        keywords: [/^claude-/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
            },
            limits: {
                maxContext: 200_000,
            },
            options: {
                unsupported: ['frequency_penalty', 'presence_penalty'],
            },
        },
    },

    // =========================
    // Google Gemini 2.5 / 3 系列
    // =========================
    {
        // Gemini 3（Pro / Flash / Omni 等）
        keywords: [/gemini[-_]?3(\.0)?/i],
        config: {
            type: 'chat',
            modalities: {
                // 官方 API 支持文本 + 图像 + 音频 + 视频输入
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,       // function calling / tool use
                streaming: true,
                reasoning: true,
                jsonMode: true,   // 支持 JSON Schema 结构化输出
            },
            limits: {
                maxContext: 1_000_000, // 官方宣传 1M 级上下文
            },
        },
    },
    {
        // Gemini 2.5（Pro / Flash）
        keywords: [/gemini[-_]?2\.5/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            limits: {
                // Gemini 2.5 Pro / Flash 也提供 1M 级上下文
                maxContext: 1_000_000,
            },
        },
    },

    // =========
    // DeepSeek
    // =========
    {
        // DeepSeek R1（reasoner）
        keywords: [/deepseek[-_]?r1/i, /deepseek[-_]?reasoner/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text'],
                output: ['text'],
            },
            capabilities: {
                tools: true,       // 支持 function calling
                streaming: true,
                reasoning: true,   // R1 是显式推理模型
                jsonMode: false,
            },
            limits: {
                // 多方资料给出 128K / 160K 级别，这里取保守 128K
                maxContext: 128_000,
                maxOutput: 8_000,
            },
            options: {
                customOverride: {
                    // 可以在这里预设比如 enable_thoughts / enable_reasoning 等 DeepSeek 自定义参数
                },
            },
        },
    },
    {
        // DeepSeek V3 / V3.1 / V3.2 / deepseek-chat
        keywords: [/deepseek[-_]?v3\.2/i, /deepseek[-_]?v3(\b|[-_])/i, /deepseek[-_]?chat/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: true,
            },
            limits: {
                // V3/V3.2 官方技术报告给出 128K 上下文
                maxContext: 128_000,
                maxOutput: 8_000,
            },
        },
    },

    // =========
    // GLM 系列
    // =========
    {
        // GLM-4.6（旗舰）
        keywords: [/glm[-_]?4\.6/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,       // OpenAI 兼容工具调用
                streaming: true,
                reasoning: true,   // 默认启用 thinking mode
                jsonMode: false,
            },
            limits: {
                // 官方及测评普遍给出 128K~200K，这里取 200K 上限
                maxContext: 200_000,
                maxOutput: 8_000,
            },
        },
    },
    {
        // GLM-4.5 / 4.5-Air 等
        keywords: [/glm[-_]?4\.5/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,       // 支持 function calling / agent 能力
                streaming: true,
                reasoning: true,   // hybrid reasoning（思考 + 快速模式）
                jsonMode: false,
            },
            limits: {
                // Zhipu 文档一般给出 128K，上游托管有时为 200K，这里取 128K 保守值
                maxContext: 128_000,
                maxOutput: 8_192,
            },
            price: {
                // 下面价格为公开估算值，仅供 UI 显示参考
                inputPerK: 0.001,
                outputPerK: 0.003,
                unit: 'USD',
            },
        },
    },

    // =========
    // Qwen 系列
    // =========
    {
        // Qwen3-Max / Qwen3-Omni / Qwen3 系列
        keywords: [/qwen3[-_]?max/i, /qwen3[-_]?omni/i, /qwen3\b/i],
        config: {
            type: 'chat',
            modalities: {
                // Qwen3-Omni / Qwen3-VL 等支持多模态输入
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true, // hybrid thinking 模式
                jsonMode: true,
            },
            limits: {
                maxContext: 128_000,
            },
        },
    },
    {
        // Qwen 多模态 / VL 系列
        keywords: [/qwen[-_]?vl/i, /qwen3[-_]?vl/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            limits: {
                maxContext: 128_000,
            },
        },
    },
    {
        // 兜底：任意 qwen*
        keywords: [/^qwen/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            limits: {
                maxContext: 128_000,
            },
        },
    },

    // =================
    // 其它 GPT / 通用兜底
    // =================
    {
        // 兜底：任何 gpt-* （非 5 系列时用）
        keywords: [/^gpt-/i],
        config: {
            type: 'chat',
            modalities: {
                input: ['text', 'image'],
                output: ['text'],
            },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            limits: {
                maxContext: 128_000,
            },
        },
    },

    // ======================
    // Embedding / 向量模型
    // ======================
    {
        keywords: [/embed/i, /text-embedding/i, /text-embedding-3/i, /bge-/i, /m3e-/i],
        config: {
            type: 'embeddings',
            modalities: {
                input: ['text'],
                output: ['text'],
            },
            capabilities: {
                tools: false,
                streaming: false,
                reasoning: false,
                jsonMode: false,
            },
            limits: {
                maxContext: 8_192,
            },
        },
    },

    // ==================
    // 图像生成 / VLM 模型
    // ==================
    {
        keywords: [/dall-e/i, /midjourney/i, /stable-diffusion/i, /flux/i, /nano-banana/i],
        config: {
            type: 'image',
            modalities: {
                input: ['text', 'image'],
                output: ['image'],
            },
            capabilities: {
                tools: false,
                streaming: false,
                reasoning: false,
                jsonMode: false,
            },
        },
    },
];