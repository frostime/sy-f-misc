import { deepMerge } from "@frostime/siyuan-plugin-kits";

interface IModelPreset {
    keywords: (string | RegExp)[];
    config: Partial<Omit<ILLMConfigV2, 'model' | 'displayName'>>;
}

const DEFAULT_CHAT_CONFIG = (): ILLMConfigV2 => ({
    model: 'model-placeholder',
    type: 'chat',
    modalities: { input: ['text'], output: ['text'] },
    capabilities: { tools: true, streaming: true },
    limits: {},
    options: { customOverride: {}, unsupported: [] },
});

export function createModelConfig(modelName: string): ILLMConfigV2 {
    const matchedPreset = MODEL_PRESETS.find(preset => {
        return preset.keywords.some(keyword => {
            if (keyword instanceof RegExp) {
                return keyword.test(modelName);
            }
            return modelName.includes(keyword);
        });
    });
    const mergedConfig = deepMerge(DEFAULT_CHAT_CONFIG(), matchedPreset?.config || {});
    const finalConfig = deepMerge(mergedConfig, {
        model: modelName,
        displayName: modelName,
    });

    return finalConfig;
}

/**
 * 常用模型预设（按优先级排序：越具体越靠前）
 */
const MODEL_PRESETS: IModelPreset[] = [
    // ===========================
    // OpenAI GPT 系列
    // ===========================

    // GPT-5.1 系列 (最新旗舰)
    {
        keywords: [/^gpt-5\.1\b/i, /gpt-5\.1[-_]/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
                reasoningEffort: true,
            },
        },
    },

    // GPT-5 主系列
    {
        keywords: [/^gpt-5\b/i, /gpt-5[-_](mini|nano|instant)/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
        },
    },

    // o-系列推理模型
    {
        keywords: [/^o[34][-_](mini|pro)/i, /^o[34]\b/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                reasoningEffort: true,
                jsonMode: false,
            },
        },
    },

    // GPT-4.1 系列 (代码优化)
    {
        keywords: [/^gpt-4\.1\b/i, /gpt-4\.1[-_]/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
        },
    },

    // GPT-4o 系列
    {
        keywords: [/^gpt-4o\b/i, /gpt-4o[-_]/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            limits: { maxContext: 128_000 },
        },
    },

    // ================
    // Anthropic Claude
    // ================

    // Claude 4.5 系列 (最新)
    {
        keywords: [
            /^claude[-_]?(opus|sonnet|haiku)[-_]?4[._]5\b/i,
            /^claude[-_]?4[._]5[-_]?(opus|sonnet|haiku)/i
        ],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: false,
            },
            limits: { maxContext: 200_000 },
            options: {
                unsupported: ['frequency_penalty', 'presence_penalty'],
            },
        },
    },

    // Claude 4 系列
    {
        keywords: [
            /^claude[-_]?(opus|sonnet|haiku)[-_]?4\b/i,
            /^claude[-_]?4[-_]?(opus|sonnet|haiku)/i
        ],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: false,
            },
            limits: { maxContext: 200_000 },
            options: {
                unsupported: ['frequency_penalty', 'presence_penalty'],
            },
        },
    },

    // Claude 3.7 (混合推理模型)
    {
        keywords: [/^claude[-_]?3[._]7\b/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: false,
            },
            limits: { maxContext: 200_000 },
            options: {
                unsupported: ['frequency_penalty', 'presence_penalty'],
            },
        },
    },

    // Claude 通用兜底
    {
        keywords: [/^claude[-_]/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: false,
            },
            limits: { maxContext: 200_000 },
            options: {
                unsupported: ['frequency_penalty', 'presence_penalty'],
            },
        },
    },

    // =========================
    // Google Gemini
    // =========================

    // Gemini 3 Pro (最新)
    {
        keywords: [/^gemini[-_]?3(\.0)?[-_]?pro/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
        },
    },

    // Gemini 2.5 系列
    {
        keywords: [/^gemini[-_]?2[._]5[-_]?(pro|flash)/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
        },
    },

    // Gemini 2.5 Flash-Lite
    {
        keywords: [/^gemini[-_]?2[._]5[-_]?flash[-_]?lite/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
        },
    },

    // Gemini 2.0 Flash
    {
        keywords: [/^gemini[-_]?2(\.0)?[-_]?flash/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: true,
            },
        },
    },

    // =========
    // DeepSeek
    // =========

    // DeepSeek V3.2
    {
        keywords: [/^deepseek[-_]?v3[._]2/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
        },
    },

    // DeepSeek V3.1 (混合推理)
    {
        keywords: [/^deepseek[-_]?v3[._]1/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
        },
    },

    // DeepSeek R1
    {
        keywords: [/^deepseek[-_]?r1/i, /^deepseek[-_]?reasoner/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: false,
            },
        },
    },

    // DeepSeek V3 / Chat
    {
        keywords: [/^deepseek[-_]?v3\b/i, /^deepseek[-_]?chat/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: true,
            },
        },
    },

    // =========
    // GLM 系列
    // =========

    // GLM-4.6 (最强编码)
    {
        keywords: [/^glm[-_]?4[._]6/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: false,
            },
            limits: { maxContext: 200_000 },
        },
    },

    // GLM-4.5 系列
    {
        keywords: [/^glm[-_]?4[._]5/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: false,
            },
            limits: { maxContext: 128_000 },
        },
    },

    // GLM-4.xv (多模态)
    {
        keywords: [/^glm[-_]?4\.[56]v/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: false,
            },
        },
    },

    // GLM 通用
    {
        keywords: [/^glm[-_]?4\b/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: false,
            },
        },
    },

    // =========
    // Qwen 系列
    // =========

    // Qwen3 系列 (最新)
    {
        keywords: [
            /^qwen3[-_]?(235b|30b|32b|14b|8b|4b|1\.7b|0\.6b)/i,
            /^qwen3[-_]?(max|plus)/i
        ],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
        },
    },

    // QwQ (推理模型)
    {
        keywords: [/^qwq[-_]/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: false,
            },
        },
    },

    // QVQ (视觉推理)
    {
        keywords: [/^qvq[-_]/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: false,
            },
        },
    },

    // Qwen3 Omni 系列 (多模态)
    {
        keywords: [/^qwen3[-_]?omni/i, /^qwen[-_]?omni/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: true,
            },
        },
    },

    // Qwen2.5 / Qwen2
    {
        keywords: [/^qwen2[._]5/i, /^qwen2\b/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: true,
            },
        },
    },

    // Qwen VL (视觉)
    {
        keywords: [/^qwen[-_]?vl/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: true,
            },
        },
    },

    // Qwen 通用兜底
    {
        keywords: [/^qwen/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: true,
            },
        },
    },

    // =================
    // GPT 通用兜底
    // =================
    {
        keywords: [/^gpt[-_]/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: false,
                jsonMode: true,
            },
        },
    },

    // ======================
    // Embedding / 向量模型
    // ======================
    {
        keywords: [
            /embed/i,
            /text-embedding/i,
            /bge[-_]/i,
            /m3e[-_]/i,
            /gte[-_]/i,
            /bce[-_]/i
        ],
        config: {
            type: 'embeddings',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: false,
                streaming: false,
                reasoning: false,
                jsonMode: false,
            },
        },
    },

    // ==================
    // 图像生成模型
    // ==================
    {
        keywords: [
            /^dall[-_]?e/i,
            /^midjourney/i,
            /^stable[-_]?diffusion/i,
            /^flux/i,
            /nano[-_]?banana/i,
            /^sd\d/i,
            /cogview/i
        ],
        config: {
            type: 'image-gen',
            modalities: { input: ['text', 'image'], output: ['image'] },
            capabilities: {
                tools: false,
                streaming: false,
                reasoning: false,
                jsonMode: false,
            }
        },
    },
];

