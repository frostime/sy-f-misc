---
name: func-module-architecture
description: src/func/ 多模块架构：IFuncModule 接口、注册与加载、设置面板、数据持久化、Plugin 集成
updated: 2026-05-04
scope:
  - /src/func/types.d.ts
  - /src/func/index.ts
  - /src/settings/index.ts
  - /src/settings/settings.tsx
  - /src/index.ts
deprecated: false
---

# src/func/ 多模块架构

## Overview

`src/func/` 是插件的功能模块目录。每个模块导出符合 `IFuncModule` 接口的对象，由 `func/index.ts` 统一注册，通过 `settings/` 实现配置 UI 和持久化，最终集成到 `FMiscPlugin` 生命周期中。

**跨文件关系**：

```
src/func/types.d.ts          ← IFuncModule 接口定义
src/func/index.ts            ← 模块注册、加载/卸载、toggle
src/settings/index.ts        ← 收集模块声明 → 初始化设置 → 持久化
src/settings/settings.tsx    ← SolidJS 设置面板 UI
src/index.ts                 ← FMiscPlugin 生命周期集成
```

---

## IFuncModule 接口

`src/func/types.d.ts` 定义的模块契约：

```typescript
interface IFuncModule {
    name: string;
    enabled: boolean;
    allowToUse?: () => boolean;       // 环境过滤（如仅桌面端）

    load: (plugin: FMiscPlugin) => void;
    unload: (plugin?: FMiscPlugin) => void;

    // 可选声明 — 决定模块在设置 UI 中的呈现方式
    declareToggleEnabled?: { title, description, defaultEnabled? };
    declareSettingPanel?: { key, title, element }[];    // 独立 Tab
    declareModuleConfig?: { key, title?, items?, load?, dump?, customPanel?, help? };
}
```

**三种声明模式的关系**：

| 声明 | 效果 | 存储位置 |
|------|------|---------|
| `declareToggleEnabled` | 在 "✅ 启用功能" Tab 显示开关 | `configs.json` → `Enable.Enable${name}` |
| `declareSettingPanel` | 独立 Tab（整个面板自定义） | 模块自行管理 |
| `declareModuleConfig` | 嵌入 "🔧 其他设置" Tab 底部 | `custom-module.config.json` → `${key}` |

模块可以同时声明 `declareToggleEnabled` + `declareModuleConfig`（如 insert-time）。
`declareSettingPanel` 和 `declareModuleConfig` 互斥使用（前者是独立 Tab，后者是嵌入区域）。

---

## 模块注册与加载

`src/func/index.ts` 将模块分为两类：

```typescript
// 可开关模块 — 由用户在设置中控制
let _ModulesToEnable: IFuncModule[] = [gpt, css, srdb, mw, ...];

// 始终启用模块 — 不显示开关，load() 无条件执行
let _ModulesAlwaysEnable: IFuncModule[] = [sc];
```

**环境过滤**：`allowToUse()` 返回 false 的模块被排除（编译时通过 filter 静态移除）。

**条件编译**：`#if [PRIVATE_ADD]` / `#if [PRIVATE_REMOVE]` 预处理指令控制私有模块的包含/排除。

### 加载流程

```
FMiscPlugin.onload()
  ├── initSetting(plugin)           ← settings/index.ts
  │     ├── 收集所有模块的 declare* 声明
  │     ├── 初始化 plugin.data.configs（Enable + Misc 默认值）
  │     ├── plugin.loadConfigs()    ← 从 configs.json 合并
  │     ├── 加载 custom-module.config.json → 调用各模块 config.load()
  │     ├── 注入 config.set() 回调（变更时自动 debounce 保存）
  │     └── 设置 plugin.openSetting()
  └── load(plugin)                  ← func/index.ts
        ├── ModulesToEnable: 检查 plugin.getConfig('Enable', 'Enable${name}')
        │   └── true → module.load(plugin)
        └── ModulesAlwaysEnable: 无条件 module.load(plugin)
```

### Toggle 流程

用户在设置面板切换开关时：

```
settings changed({ group: 'Enable', key: 'EnableXxx', value: true/false })
  → toggleEnable(plugin, key, enable)     ← func/index.ts
      → EnableKey2Module[key].load(plugin)   // enable=true
      → EnableKey2Module[key].unload(plugin) // enable=false
```

**关键约定**：Enable key 格式必须是 `Enable${module.name}`。`EnableKey2Module` 在模块加载时由映射表构建。

---

## 数据持久化

插件存在**两套独立的持久化系统**（历史原因）：

### 系统 1：Legacy configs（plugin.data.configs）

**存储文件**：`configs.json`

**结构**：
```json
{
  "Enable": { "EnableGPT": true, "EnableInsertTime": false, ... },
  "Docky": { "DockyEnableZoom": true, ... },
  "Misc": { "zoteroPassword": "...", ... }
}
```

**生命周期**：
- `initSetting()` 构建默认值 → `plugin.loadConfigs()` 从文件合并 → `plugin.saveConfigs()` 写回
- 变更通过 `onChanged()` 回调 → debounce 10s 保存

**使用方**：`declareToggleEnabled` 的开关状态、`Docky` 配置、`Misc` 杂项

### 系统 2：Module Configs（custom-module.config.json）

**存储文件**：`custom-module.config.json`

**结构**：
```json
{
  "insert-time": { "templatePattern": "..." },
  "gpt": { ... },
  "doc-context": { ... }
}
```

**生命周期**：
- `initSetting()` 加载文件 → 遍历 `CustomModuleConfigs` → 调用 `config.load(storage[config.key])`
- `config.set()` 被注入回调 → `onModuleConfigChanged()` → debounce 5s 保存整个文件
- `config.dump()` 或 `config.items[].get()` 序列化当前值

**使用方**：`declareModuleConfig` 的所有模块

### 两套系统的关系

```
initSetting()
  ├── 系统 1: plugin.data.configs (Enable/Misc/Docky)
  │     └── 变更 → plugin.saveConfigs() → configs.json
  │
  └── 系统 2: CustomModuleConfigs[]
        └── 变更 → saveModuleConfig() → custom-module.config.json
```

模块的 `declareModuleConfig.load()` 接收的是 `custom-module.config.json` 中该模块 key 下的值。
模块的 `declareModuleConfig.dump()` 返回的值会被写入 `custom-module.config.json`。

---

## declareModuleConfig 两种写法

### 写法 1：手动 load/dump/get/set（主流）

大多数模块采用此模式。模块自己管理内存变量，手动编写 load/dump/get/set：

```typescript
// 内存中的配置状态
let config = { parentChildCommand: true, overwriteCtrlUpDownKey: true };

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "doc-context",
    title: "文档上下文",
    load: (itemValues) => { if (itemValues) config = { ...config, ...itemValues }; },
    dump: () => structuredClone(config),
    items: [
        {
            key: 'parentChildCommand',
            type: 'checkbox',
            title: '启用切换父子文档快捷键',
            get: () => config.parentChildCommand,
            set: (value) => { config.parentChildCommand = value; }
        }
    ]
};
```

**注意**：`initSetting()` 会注入 `set()` 回调来触发自动保存。模块的 `set()` 被包装后，每次调用都会触发 `custom-module.config.json` 的 debounce 保存。模块不需要自行调用保存。

### 写法 2：createSettingAdapter（siyuan-plugin-kits）

`@frostime/siyuan-plugin-kits` 提供 `createSettingAdapter(configDefinitions)` 工具函数，自动管理 get/set 状态，减少样板代码：

```typescript
import { createSettingAdapter } from "@frostime/siyuan-plugin-kits";

const configDefinitions = [
    { key: 'codeEditor', type: 'textinput', value: 'code', title: '打开代码编辑器', devicewise: true }
];

const configAdapter = createSettingAdapter(configDefinitions);

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "global-configs",
    title: "公用配置",
    load: (itemValues) => { configAdapter.init(itemValues); },
    dump: () => configAdapter.dump(),
    items: configDefinitions.map(item => ({
        ...item,
        get: () => configAdapter.get(item.key),
        set: (value) => configAdapter.set(item.key, value)
    }))
};

// 业务代码读取配置
export const sharedConfigs = (key) => configAdapter.get(key);
```

**选择建议**：简单键值对用写法 2 减少样板；复杂配置（如需要在 load 时执行副作用）用写法 1。

---

## 模块目录结构

两种组织方式：

### 单文件模块

功能简单的模块直接放在 `src/func/` 下：

```
src/func/
├── insert-time.ts      ← name, load, unload, declare* 全在一个文件
├── custom-css-file.ts
├── markdown.ts
├── mini-window.ts
├── titled-link.ts
└── docky.ts
```

### 目录模块

功能复杂、需要拆分文件的模块：

```
src/func/gpt/
├── index.ts            ← 模块入口（name, load, unload, declare*）
├── model/              ← 子功能
├── chat/
├── openai/
└── ...

src/func/zotero/
├── index.ts            ← load/unload，export { declareModuleConfig } from './config'
├── config.ts           ← declareModuleConfig 独立文件
└── zoteroModal.ts

src/func/private-func/
├── index.ts            ← export { declareModuleConfig } from './config'
├── config.ts           ← declareModuleConfig
└── auto-sync.ts
```

**目录模块的 config 外置模式**：`zotero/` 和 `private-func/` 将 `declareModuleConfig` 放在独立 `config.ts` 中，`index.ts` 通过 re-export 暴露。适合配置项较多或配置逻辑独立的模块。

---

## 设置面板 UI

`src/settings/settings.tsx` 渲染 SolidJS 组件：

```
Settings App
├── Tab: "✅ 启用功能"     → SettingPanel(GroupEnabled)  — 所有 declareToggleEnabled 的 checkbox
├── Tab: "🔧 其他设置"     → SettingPanel(GroupMisc) + CustomModuleConfigs
│   └── CustomModuleConfigs: 嵌入各模块的 declareModuleConfig（带边框的子区域）
├── Tab: 自定义面板 × N    → declareSettingPanel[].element（如 GPT 设置、Toggl 设置）
└── Tab bar 切换 → createSignal + Dynamic component
```

**CustomModuleConfigs 渲染逻辑**：
- 遍历 `customModuleConfigs` 数组
- 每个 config 渲染一个带标题和边框的区域
- `config.items` → `Form.Wrap` + `Form.Input` 渲染表单项
- `config.customPanel` → `SolidContainerWrapper` 渲染自定义 SolidJS 组件

---

## Plugin 集成

`src/index.ts` 的 `FMiscPlugin` 类：

```typescript
class FMiscPlugin extends Plugin {
    data: { configs: { Enable, Docky, Misc } };

    async onload() {
        registerPlugin(this);
        this.initDefaultFunctions();   // 顶栏菜单
        await initSetting(this);       // 收集声明 + 加载配置
        load(this);                    // 加载各模块
    }

    async onunload() {
        unload(this);                  // 卸载各模块
    }

    // 模块可调用的 API
    getConfig(group, key): any;
    addTopBar(options); addCommand(options); addDock(options);
    registerMenuTopMenu(key, menu);  // 顶栏自定义菜单
    addLayoutReadyCallback(cb);      // 布局就绪回调
}
```

**模块与 Plugin 的交互模式**：
- `load(plugin)` 中注册菜单、命令、dock、事件监听
- `unload(plugin)` 中清理所有注册的资源
- 通过 `thisPlugin()` 获取 plugin 实例（siyuan-plugin-kits 提供）
- 通过 `globalThis.fmisc` 暴露跨模块 API（如 `fmisc.gpt.complete()`）
