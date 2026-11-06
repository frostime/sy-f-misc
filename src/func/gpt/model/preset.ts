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

    // GPT-6 旗舰
    {
        keywords: [/^gpt[-_]?6[-_]?astra/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            options: { compat: { thinking: { enabled: true } } },
            price: { inputPerM: 10, outputPerM: 50, unit: 'USD' },
        },
    },

    // GPT-6.1 Sol
    {
        keywords: [/^gpt[-_]?6\.1[-_]?sol/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            options: { compat: { thinking: { enabled: true } } },
            price: { inputPerM: 2, outputPerM: 10, unit: 'USD' },
        },
    },

    // GPT-6.1 Terra
    {
        keywords: [/^gpt[-_]?6\.1[-_]?terra/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            options: { compat: { thinking: { enabled: true } } },
            price: { inputPerM: 1, outputPerM: 5, unit: 'USD' },
        },
    },

    // GPT-6 Luna
    {
        keywords: [/^gpt[-_]?6(\.1)?[-_]?luna/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            options: { compat: { thinking: { enabled: true } } },
            price: { inputPerM: 0.1, outputPerM: 0.5, unit: 'USD' },
        },
    },

    // GPT-5.6 Sol（官方尚未公布促销结束后的价格，此处按当前实付价记录）
    {
        keywords: [/^gpt[-_]?5\.6[-_]?sol/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            options: { compat: { thinking: { enabled: true } } },
            price: { inputPerM: 4, outputPerM: 20, unit: 'USD' },
        },
    },

    // ================
    // Anthropic Claude
    // ================

    // Claude Fable 5.1
    {
        keywords: [/^claude[-_]?fable[-_]?5\.1/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 200_000 },
            price: { inputPerM: 10, outputPerM: 50, unit: 'USD' },
        },
    },

    // Claude Opus 5.5
    {
        keywords: [/^claude[-_]?opus[-_]?5\.5/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 1_000_000 },
            price: { inputPerM: 4, outputPerM: 20, unit: 'USD' },
        },
    },

    // Claude Sonnet 5.5
    {
        keywords: [/^claude[-_]?sonnet[-_]?5\.5/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 1_000_000 },
            price: { inputPerM: 2, outputPerM: 10, unit: 'USD' },
        },
    },

    // Claude Haiku 5.5（提示 >100K 时价格更高，此处记录常规档）
    {
        keywords: [/^claude[-_]?haiku[-_]?5\.5/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 200_000 },
            price: { inputPerM: 0.1, outputPerM: 0.5, unit: 'USD' },
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
                compat: {
                    unsupported: ['frequency_penalty', 'presence_penalty'],
                    thinking: {
                        enabled: true,
                        claudeMode: 'adaptive',
                        supportedEfforts: ['none', 'low', 'medium', 'high'],
                    },
                },
            },
        },
    },

    // =========================
    // Google Gemini
    // =========================

    // Gemini 4 Argon
    {
        keywords: [/^gemini[-_]?4[-_]?argon/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image', 'file'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            limits: { maxContext: 1_000_000 },
            options: { compat: { thinking: { enabled: true } } },
            price: { inputPerM: 4, outputPerM: 20, unit: 'USD' },
        },
    },

    // Gemini Flash-Lite：档位与 Flash 不同，不继承 Flash 的价目；必须排在对应 Flash 之前
    {
        keywords: [/^gemini[-_]?[0-9.]+[-_]?flash[-_]?lite/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image', 'file'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            limits: { maxContext: 1_000_000 },
            options: { compat: { thinking: { enabled: true } } },
        },
    },

    // Gemini 3.8 Flash
    {
        keywords: [/^gemini[-_]?3\.8[-_]?flash/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image', 'file'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            limits: { maxContext: 1_000_000 },
            options: { compat: { thinking: { enabled: true } } },
            price: { inputPerM: 1.5, outputPerM: 7.5, unit: 'USD' },
        },
    },

    // Gemini 3.7 Flash（已被 3.8 Flash 接管，保留旧名匹配并按同一标准价记录）
    {
        keywords: [/^gemini[-_]?3\.7[-_]?flash/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image', 'file'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            limits: { maxContext: 1_000_000 },
            options: { compat: { thinking: { enabled: true } } },
            price: { inputPerM: 1.5, outputPerM: 7.5, unit: 'USD' },
        },
    },

    // Gemini 3.1 Pro（>200K 上下文输入价翻倍，此处记录常规档）
    {
        keywords: [/^gemini[-_]?3\.1[-_]?pro/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image', 'file'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            limits: { maxContext: 1_000_000 },
            options: { compat: { thinking: { enabled: true } } },
            price: { inputPerM: 2, outputPerM: 12, unit: 'USD' },
        },
    },

    // Gemini 通用
    {
        keywords: [/^gemini[-_]/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image', 'file'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            options: {
                compat: {
                    thinking: { enabled: true },
                    // thinkingStyle 不需要——Gemini 协议在 buildGeminiPayload 中处理 thinking
                },
            },
        },
    },


    // =========
    // DeepSeek
    // =========

    // DeepSeek V4 Pro
    {
        keywords: [/^deepseek[-_]?v4(?:\.1)?[-_]?pro/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            options: {
                compat: {
                    unsupported: ['frequency_penalty', 'presence_penalty'],
                    thinking: {
                        enabled: true,
                        thinkingStyle: 'deepseek',
                        supportedEfforts: ['none', 'high', 'max'],
                    },
                },
            },
            price: { inputPerM: 9, outputPerM: 27, unit: 'CNY' },
        },
    },

    // DeepSeek Flash（实际服务 V4.1-Flash；旧名 v4-flash 已被路由到它）
    {
        keywords: [/^deepseek[-_]?(?:v4(?:\.1)?[-_]?)?flash/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: {
                tools: true,
                streaming: true,
                reasoning: true,
                jsonMode: true,
            },
            options: {
                compat: {
                    unsupported: ['frequency_penalty', 'presence_penalty'],
                    thinking: { enabled: true, thinkingStyle: 'deepseek' },
                },
            },
            price: { inputPerM: 2, outputPerM: 8, unit: 'CNY' },
        },
    },

    // =========
    // GLM 系列
    // =========

    // GLM-5 的轻量档（Air / Lite）：档位价格不同，不继承全价；必须排在对应条目之前
    {
        keywords: [/^glm[-_]?5[^@]*(air|lite)/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 200_000 },
        },
    },

    // GLM-5.3-Flash（必须排在 GLM-5.3 之前）
    {
        keywords: [/^glm[-_]?5\.3[^@]*flash/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 200_000 },
            price: { inputPerM: 0.8, outputPerM: 2.8, unit: 'CNY' },
        },
    },

    // GLM-5.3
    {
        keywords: [/^glm[-_]?5\.3/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 1_000_000 },
            price: { inputPerM: 8, outputPerM: 28, unit: 'CNY' },
        },
    },

    // GLM-5.1
    {
        keywords: [/^glm[-_]?5\.1/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 200_000 },
            price: { inputPerM: 6, outputPerM: 24, unit: 'CNY' },
        },
    },

    // GLM-5-Turbo：价格未核实，先不记价；但必须排在 GLM-5 之前，否则会继承 GLM-5 的价目
    {
        keywords: [/^glm[-_]?5[^@]*turbo/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
        },
    },

    // GLM-5（仅精确到 5 与 5.0；5.2/5.4 等未记录价目的版本落到下面的兜底，避免套用错档价格）
    {
        keywords: [/^glm[-_]?5(?:[._]0)?(?![\d.])/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 200_000 },
            price: { inputPerM: 4, outputPerM: 18, unit: 'CNY' },
        },
    },

    // GLM-5 其他版本兜底：只给能力，不给价格
    {
        keywords: [/^glm[-_]?5/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: false },
            limits: { maxContext: 200_000 },
        },
    },

    // =========
    // Qwen 系列
    // =========

    // Qwen3.8 VL（视觉）
    {
        keywords: [/^qwen[-_]?3\.8[^@]*vl/i],
        config: {
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: false, jsonMode: true },
        },
    },

    // Qwen3.8 系列
    {
        keywords: [/^qwen[-_]?3\.8/i],
        config: {
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: { tools: true, streaming: true, reasoning: true, jsonMode: true },
            options: { compat: { thinking: { enabled: true, thinkingStyle: 'qwen' } } },
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

