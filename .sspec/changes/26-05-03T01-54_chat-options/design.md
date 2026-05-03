---
change: "chat-options"
created: 2026-05-03T01:54:11
---

# Design: chat-options

## 1. 类型定义

### 1.1 新增类型（`types.ts`）

```typescript
// 归一化 reasoning 级别。严格匹配 OpenAI Chat Completions 官方值
// 来源: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

// ChatSetting UI 中用户可手动开关的参数（共 6 个）
type ConfigurableChatOption =
  | 'temperature' | 'max_tokens' | 'top_p'
  | 'frequency_penalty' | 'presence_penalty' | 'reasoning_effort';

// 模型级别的兼容性配置（ILLMConfigV2.options 中）
interface ILLMOptionCompat {
  /** 模型不支持的 ChatOption 参数，发送前删除 */
  unsupported?: (keyof IChatCompleteOption)[];
  /** 该模型默认启用哪些可配置参数。
      仅用于初始化 session 的 chatOptionToggles 默认值；
      adapter 层不做过滤，不会删除 key。 */
  enabledByDefault?: ConfigurableChatOption[];
  /** thinking / reasoning 相关配置 */
  thinking?: {
    /** 模型是否支持 reasoning（替代 capabilities.reasoningEffort） */
    enabled: boolean;
    /** thinking 参数的结构风格（仅 protocol='openai' 时需要） */
    thinkingStyle?: 'openai' | 'deepseek' | 'qwen';
    /** 模型支持的 effort 级别（如 DeepSeek V4 只支持 none/high/xhigh）。
        UI 过滤 + adapter 二次校验：不在列表的 effort 会被 clamp 到最近可用值 */
    supportedEfforts?: ReasoningEffort[];
    /** 归一化 effort → API 原生值（如 DeepSeek V4: { xhigh: 'max' }） */
    effortMap?: Partial<Record<ReasoningEffort, string>>;
    /** 归一化 effort → token 预算（Claude/Gemini 协议用）。
        缺省时使用内置回退: minimal=1024, low=2048, medium=8192, high=16384 */
    budgetMap?: Partial<Record<ReasoningEffort, number>>;
  };
}
```

### 1.2 修改的类型

```typescript
// IChatSessionConfig（已有字段略）
interface IChatSessionConfig {
  // ... existing ...
  chatOption: IChatCompleteOption;
  /** 新增：参数显式开关。key 不存在 ≈ toggle=true（兼容旧数据） */
  chatOptionToggles?: Partial<Record<keyof IChatCompleteOption, boolean>>;
}
```

### 1.3 `thinkingStyle` 行为定义

| 值 | 发送的 HTTP payload | 用户模型 |
|----|-------------------|---------|
| `'openai'`（默认） | `{ reasoning_effort: "<value>" }` | GPT 全系 |
| `'deepseek'` | `{ thinking: { type: "enabled"\|"disabled" }, reasoning_effort: "<value>" }` | DeepSeek V3.1+ |
| `'qwen'` | `{ enable_thinking: true\|false }` | Qwen3 |

`thinkingStyle` 仅对 `protocol='openai'` 的模型有意义。Claude/Gemini 协议在各自的 `buildXxxPayload` 中独立处理 thinking。

---

## 2. 数据流

### 2.1 当前流

```
defaultConfig.chatOption (全局默认)
  → sessionConfig.chatOption (per-session 拷贝)
    → customOptions signal (per-session JSON 覆盖)
      → buildChatOption() merge
        → adaptChatOptions() sanitize (deleteIfEqual + unsupported + limits + capabilities)
          → API payload
```

### 2.2 新流

```
defaultConfig.chatOption (+ toggles)  ← 全局默认几乎为空
  → session 初始化时:
    ├─ modelConfig.options.compat.enabledByDefault → 设置 toggles 默认值
    └─ sessionConfig.chatOption (+ toggles)
  → customOptions signal  ← per-session JSON override（保留）
    → buildChatOption() merge
      → applyOptionCompat(merged, compat, toggles)
        ├─ 1. toggle=false → delete key
        ├─ 2. unsupported → delete key
        ├─ 3. thinking 参数注入 (per thinkingStyle)
        └─ 4. supportedEfforts 校验：不在列表的 effort clamp 到最近可用值
      → adaptChatOptions() (limits clamp + capabilities 检查)
        → API payload
```

`enabledByDefault` **只参与 session 初始化**（设置 toggle 默认值），不参与 runtime adapter 过滤。

### 2.3 合并优先级（低→高）

```
defaultConfig.chatOption
  < modelConfig.options.compat 预设
    < config.chatOption (per-session)
      < session.customOptions (JSON override)
```

---

## 3. Adapter 核心逻辑

```typescript
// 位置: src/func/gpt/openai/adpater.ts

/** Clamp effort 到模型 supportedEfforts 中的最近可用值 */
const clampEffort = (
  effort: ReasoningEffort,
  supported: ReasoningEffort[] | undefined,
): ReasoningEffort => {
  if (!supported || supported.length === 0) return effort;
  if (supported.includes(effort)) return effort;
  // 找最近的高一级，否则最近的低一级
  const ALL: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  const idx = ALL.indexOf(effort);
  for (let i = idx + 1; i < ALL.length; i++) {
    if (supported.includes(ALL[i])) return ALL[i];
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (supported.includes(ALL[i])) return ALL[i];
  }
  return supported[0];
};

const applyOptionCompat = (
  chatOption: IChatCompleteOption,
  toggles: Partial<Record<keyof IChatCompleteOption, boolean>> | undefined,
  compat: ILLMOptionCompat | undefined,
): IChatCompleteOption => {
  const option = structuredClone(chatOption);

  // 1. Toggle 删除（key 不存在 = 视为 true，兼容旧数据）
  for (const key of Object.keys(option)) {
    if (toggles?.[key] === false) delete option[key];
  }

  // 2. Unsupported 删除
  if (compat?.unsupported) {
    for (const key of compat.unsupported) delete option[key];
  }

  // 3. Thinking 参数注入
  if (compat?.thinking?.enabled) {
    const rawEffort = option.reasoning_effort as ReasoningEffort | undefined;
    const style = compat.thinking.thinkingStyle ?? 'openai';
    const map = compat.thinking.effortMap;

    // 3a. supportedEfforts 校验
    let effort: ReasoningEffort | undefined = rawEffort;
    if (effort && compat.thinking.supportedEfforts) {
      effort = clampEffort(effort, compat.thinking.supportedEfforts);
    }

    // 3b. 按 thinkingStyle 构建 payload
    if (style === 'deepseek') {
      (option as any).thinking = {
        type: effort && effort !== 'none' ? 'enabled' : 'disabled'
      };
      if (effort && effort !== 'none') {
        option.reasoning_effort = map?.[effort] ?? effort;
      } else {
        delete option.reasoning_effort;
      }
    } else if (style === 'qwen') {
      delete option.reasoning_effort;
      (option as any).enable_thinking = !!(effort && effort !== 'none');
    } else {
      // openai (default)
      if (effort && effort !== 'none') {
        option.reasoning_effort = map?.[effort] ?? effort;
      } else {
        delete option.reasoning_effort;
      }
    }
  }

  return option;
};
```

`adaptChatOptions` 简化为仅保留 limits clamp + capabilities 检查（tools、streaming）。

`enabledByDefault` 不在此处消费——它只在 session 初始化时用于填充 `chatOptionToggles` 默认值（见 `use-chat-session.ts`）。

---

## 4. UI 变更

### 4.1 ChatSetting.tsx — toggle + reasoning section

```
GPT 对话参数
├── 默认使用模型     [select]
├── 附带历史消息     [number]
├── ...
├── Stream 模式      [checkbox]          ← 不变

─── 🧠 Reasoning ───                    ← 新增 section 分隔
├── Reasoning Effort
│   ☑ 启用   [select: none|minimal|low|medium|high|xhigh]
│   提示: 模型的 reasoning 级别可选项，可在 Provider 配置中限制

─── 📐 采样参数 ───                      ← 新增 section 分隔
├── ☑ Temperature           [slider 0-2]
├── ☑ 最大 Token 数         [number]
├── ☑ Top P                 [number 0-1]
├── ☑ 存在惩罚              [number -2..2]
├── ☑ 频率惩罚              [number -2..2]
```

每个 toggle checkbox 控制 `config.chatOptionToggles[key]`。

### 4.2 ProviderSettingV2.tsx — model compat panel

在 `ModelConfigPanel` 中，`options.unsupported` 和 `customOverride` 区域替换为：

```
─── 参数兼容 ───
├── Thinking
│   ├── ☑ 启用 reasoning
│   ├── 参数风格:  [openai ▾]           ← 仅 protocol='openai' 显示
│   ├── 支持级别:  [x] none [x] low [x] medium [x] high [x] xhigh  ← 多选
│   └── 值映射:    [JSON textarea]       ← 按需，占位提示: e.g. {"xhigh":"max"}
├── 不支持的参数:   [textarea]            ← 已有，类型收紧
└── 默认启用参数:   [x] temperature [x] top_p ...  ← 多选
```

---

## 5. 模型预设（preset.ts）

关键模型补充 `options.compat`：

```typescript
// DeepSeek V3.1 / V3.2
{
  keywords: [/^deepseek[-_]?v3[._]1/i, /^deepseek[-_]?v3[._]2/i],
  config: {
    // ... existing ...
    options: {
      compat: {
        unsupported: ['frequency_penalty', 'presence_penalty'],
        thinking: {
          enabled: true,
          thinkingStyle: 'deepseek' as const,
        },
      },
    },
  },
}

// DeepSeek R1（推理模型，不支持采样参数）
{
  keywords: [/^deepseek[-_]?r1/i],
  config: {
    // ... existing ...
    options: {
      compat: {
        unsupported: ['temperature', 'top_p', 'frequency_penalty', 'presence_penalty'],
        thinking: {
          enabled: true,
          thinkingStyle: 'deepseek' as const,
        },
      },
    },
  },
}

// DeepSeek V4 (2026-04 发布, 仅支持 none/high/xhigh, xhigh→'max')
{
  keywords: [/^deepseek[-_]?v4/i],
  config: {
    // ... existing ...
    options: {
      compat: {
        thinking: {
          enabled: true,
          thinkingStyle: 'deepseek' as const,
          supportedEfforts: ['none', 'high', 'xhigh'],
          effortMap: { xhigh: 'max' },
        },
      },
    },
  },
}

// GPT 5.x（显式声明 reasoning 支持）
{
  keywords: [/^gpt-5\.\d/i],
  config: {
    // ... existing ...
    options: {
      compat: {
        thinking: { enabled: true },
      },
    },
  },
}

// Claude（通过 protocol 处理 thinking，见下方 "Claude/Gemini Thinking Payload" 节）
{
  keywords: [/^claude[-_]/i],
  config: {
    // ... existing ...
    options: {
      compat: {
        unsupported: ['frequency_penalty', 'presence_penalty'],
        thinking: {
          enabled: true,
          // thinkingStyle 不需要——Claude protocol 走 buildClaudePayload
        },
      },
    },
  },
}

// Gemini（通过 protocol 处理 thinking）
{
  keywords: [/^gemini[-_]/i],
  config: {
    // ... existing ...
    options: {
      compat: {
        thinking: {
          enabled: true,
          // thinkingStyle 不需要——Gemini protocol 走 buildGeminiPayload
        },
      },
    },
  },
}
```

### 5.1 Claude/Gemini Thinking Payload 合约

Claude 和 Gemini 协议在各自的 `buildXxxPayload` 中独立构建 thinking 参数，**不经由 `applyOptionCompat`**。

**Claude (`buildClaudePayload`)**：

```typescript
// 位置: claude-complete.ts ~L125

// 在 payload 中注入 thinking block
if (compat?.thinking?.enabled) {
  const effort = option.reasoning_effort as ReasoningEffort | undefined;
  if (effort && effort !== 'none') {
    const budget = compat.thinking.budgetMap?.[effort]
      ?? DEFAULT_THINKING_BUDGETS[effort];  // 内置回退
    payload.thinking = {
      type: 'enabled',
      budget_tokens: budget,
    };
    // Claude: thinking 开启时 temperature/top_p 必须为 1
    delete payload.temperature;
    delete payload.top_p;
  } else {
    // 显式禁用 thinking
    payload.thinking = { type: 'disabled' };
  }
}
```

**Gemini (`buildGeminiPayload`)**：

```typescript
// 位置: gemini-complete.ts ~L160

// 在 generationConfig 中注入 thinkingConfig
if (compat?.thinking?.enabled) {
  const effort = option.reasoning_effort as ReasoningEffort | undefined;
  if (effort && effort !== 'none') {
    const budget = compat.thinking.budgetMap?.[effort]
      ?? DEFAULT_THINKING_BUDGETS[effort];
    payload.generationConfig = {
      ...payload.generationConfig,
      thinkingConfig: {
        thinkingBudget: budget,
      },
    };
  }
}
```

**内置 thinking budget 回退**（`DEFAULT_THINKING_BUDGETS`，全局常量）：

```typescript
const DEFAULT_THINKING_BUDGETS: Record<string, number> = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
  xhigh: 32768,  // Claude Opus 4.5+ 支持，其他模型可通过 budgetMap 覆盖
};
```

`xhigh` 有默认回退值 32768，模型可通过 `budgetMap` 覆盖。

**`enabledByDefault` 所有权**：初始化逻辑仅在 `use-chat-session.ts` 中——创建新 session 时读取 `modelConfig.options.compat.enabledByDefault` 写入 `chatOptionToggles` 初始值。`use-openai-endpoints.ts` 不触碰此字段。`chat/main.tsx:135-141` 的 `customOverride` 注入路径保持不变（只覆盖 option 值，不触及 toggles）。

---

## 6. 迁移 3.1 → 3.2

```typescript
// 在 config_migration.ts 的历史版本兼容() 中新增

if (compareSchemaVersion(dataSchema, '3.2') < 0) {
  // a. 旧 chatOption 值 → toggles 全 true
  const config = (data as any).config;
  if (config?.chatOption && !config.chatOptionToggles) {
    const toggles: Record<string, boolean> = {};
    for (const key of Object.keys(config.chatOption)) {
      if (config.chatOption[key] !== undefined && config.chatOption[key] !== null) {
        toggles[key] = true;
      }
    }
    config.chatOptionToggles = toggles;
  }

  // b. capabilities.reasoningEffort → optionCompat.thinking.enabled
  for (const provider of ((data as any).llmProviders || [])) {
    for (const model of (provider.models || [])) {
      if (model.capabilities?.reasoningEffort) {
        model.options = model.options || {};
        model.options.compat = model.options.compat || {};
        model.options.compat.thinking = model.options.compat.thinking || {};
        model.options.compat.thinking.enabled = true;
        // 不删除 capabilities.reasoningEffort，保留兼容
      }
    }
  }

  migrated = true;
}
```

---

## 7. main.tsx 空值安全 + toggle-off UX

当前 `src/func/gpt/chat/main.tsx:1223,1261` 直接调用 `config().chatOption.temperature.toFixed(2)`。
清空默认值后 `temperature` 为 `undefined`，必然崩溃。

修复策略：

```typescript
// toolbar 温度显示
const tempDisplay = () => {
  const toggles = config().chatOptionToggles;
  if (toggles?.temperature === false) return 'API 默认';
  const t = config().chatOption.temperature;
  return t !== undefined ? t.toFixed(2) : 'API 默认';
};
```

规则：toggle=false 或值为 undefined → 显示「API 默认」文本。toggle=true 且有值 → 显示数值。

---

## 8. 文件变更清单

```
src/func/gpt/types.ts                    # +ReasoningEffort, +ConfigurableChatOption, +ILLMOptionCompat, 
                                          #   +chatOptionToggles, 扩展 IChatCompleteOption.reasoning_effort→6级
src/func/gpt/model/config.ts             # 清空默认值（仅新安装用户生效）
src/func/gpt/model/config_migration.ts   # bump CURRENT_SCHEMA + 3.1→3.2 migration（保留旧值）
src/func/gpt/model/storage.ts            # 验证 deepMerge 兼容性
src/func/gpt/model/preset.ts             # MODEL_PRESETS 补齐 compat
src/func/gpt/openai/adpater.ts           # 重写: +applyOptionCompat (含 clampEffort), 简化 adaptChatOptions
src/func/gpt/openai/complete.ts          # 集成 thinking 注入
src/func/gpt/openai/claude-complete.ts   # buildClaudePayload: thinking block + budget 映射
src/func/gpt/openai/gemini-complete.ts   # buildGeminiPayload: thinkingConfig + budget 映射
src/func/gpt/chat/ChatSession/use-openai-endpoints.ts  # buildChatOption 集成
src/func/gpt/chat/ChatSession/use-chat-session.ts      # session 初始化时读取 compat.enabledByDefault 设置 toggles
src/func/gpt/setting/ChatSetting.tsx     # toggle checkbox + reasoning section 提升
src/func/gpt/setting/ProviderSettingV2.tsx # 模型 compat panel
src/func/gpt/chat/main.tsx              # 修复 temperature 空值安全 + toggle-off 显示「API 默认」+ toolbar 快捷调参
```
