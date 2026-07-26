---
name: func-module-architecture
description: src/func/ 多模块架构：IFuncModule 接口、注册与加载、设置面板、数据持久化、Plugin 集成
updated: 2026-07-26
scope:
  - /src/func/types.d.ts
  - /src/func/index.ts
  - /src/settings/index.ts
  - /src/settings/persistence.ts
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
src/func/index.ts            ← 模块注册、awaitable 加载/卸载/toggle
src/settings/index.ts        ← 收集模块声明 → 组装设置 UI
src/settings/persistence.ts  ← 设置初始化、持久化、同步 reconciliation
src/settings/settings.tsx    ← SolidJS 设置面板 UI
src/index.ts                 ← SiYuan 与 settings/feature 生命周期适配
```

---

## IFuncModule 接口

`src/func/types.d.ts` 定义的模块契约：

```typescript
interface IFuncModule {
    name: string;
    enabled: boolean;
    allowToUse?: () => boolean;       // 环境过滤（如仅桌面端）

    load: (plugin: FMiscPlugin) => void | Promise<void>;
    unload: (plugin?: FMiscPlugin) => void | Promise<void>;

    declareDedicatedSettingsStorage?: {
        fileName: string;
        getRuntimeSettingsSnapshot: () => Record<string, unknown>;
        applyStoredSettingsToRuntime: (stored, plugin) => void | Promise<void>;
    };

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
| `declareSettingPanel` | 独立 Tab（整个面板自定义） | 不规定存储 |
| `declareModuleConfig` | 声明 shared module settings | `custom-module.config.json` → `${key}` |
| `declareDedicatedSettingsStorage` | 声明 dedicated file 与 runtime settings 的双向映射 | 声明中的 `fileName` |

四种声明相互独立。GPT/Toggl 组合 `declareSettingPanel` 与 `declareDedicatedSettingsStorage`；常规模块通常组合 `declareToggleEnabled` 与 `declareModuleConfig`。

`applyStoredSettingsToRuntime()` 只更新设置运行状态。禁止在其中注册命令、事件、Dock、网络初始化或脚本扩展；这些副作用属于 `load()`。

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
  ├── initSetting(plugin)                         ← settings/index.ts
  │     ├── 收集所有模块的 declare* 声明
  │     ├── SettingsPersistence.initialize()      ← settings/persistence.ts
  │     │   ├── defaults → configs.json
  │     │   ├── custom-module.config.json → config.load()
  │     │   ├── dedicated files → applyStoredSettingsToRuntime()
  │     │   ├── 建立 disk/applied runtime snapshots
  │     │   └── 注入现有 debounce 保存回调
  │     └── 设置 plugin.openSetting()
  └── await load(plugin)                          ← func/index.ts
        ├── ModulesToEnable: Enable=true → await module.load(plugin)
        └── ModulesAlwaysEnable: await module.load(plugin)
```

### Toggle 流程

用户在设置面板切换开关时：

```
settings changed({ group: 'Enable', key: 'EnableXxx', value: true/false })
  → debounce side effect
  → await toggleEnable(plugin, key, enable)  ← func/index.ts
      → await EnableKey2Module[key].load(plugin)   // enable=true
      → await EnableKey2Module[key].unload(plugin) // enable=false
```

**关键约定**：Enable key 格式必须是 `Enable${module.name}`。`EnableKey2Module` 在模块加载时由映射表构建。

---

## 数据持久化

插件保留两套 shared persistence，并为拥有独立文件的模块增加 dedicated settings 声明。三者由 [`SettingsPersistence`](/src/settings/persistence.ts) 统一初始化和协调，但 schema 与 runtime 映射仍由原所有者负责。

### 系统 1：Legacy configs（plugin.data.configs）

**存储文件**：`configs.json`

**结构**：
```json
{
  "Enable": { "EnableGPT": true, "EnableInsertTime": false, ... },
  "Misc": { "zoteroPassword": "...", ... }
}
```

**生命周期**：
- `SettingsPersistence.initialize()` 构建默认值 → `plugin.loadConfigs()` 从文件合并
- `initSetting()` 将 UI change 转交 persistence → debounce 10s → `plugin.saveConfigs()`

**使用方**：`declareToggleEnabled` 的开关状态与 legacy `Misc` 杂项

### 系统 2：Module Configs（custom-module.config.json）

**存储文件**：`custom-module.config.json`

**结构**：
```json
{
  "insert-time": { "templatePattern": "..." },
  "Docky": { "DockyEnableZoom": true, ... },
  "doc-context": { ... }
}
```

**生命周期**：
- `SettingsPersistence.initialize()` 加载文件 → 遍历 declarations → 调用 `config.load(storage[config.key])`
- persistence 包装 `config.items[].set()` → debounce 5s 保存整个文件
- `config.dump()` 或 `config.items[].get()` 序列化当前值

**使用方**：`declareModuleConfig` 的所有模块

### 系统 3：Dedicated Settings Files

GPT/Toggl 的自定义设置面板分别使用 `gpt.config.json` / `toggl.json`。模块通过 `declareDedicatedSettingsStorage` 暴露：

- `getRuntimeSettingsSnapshot()`：返回现有 save 路径使用的 payload。
- `applyStoredSettingsToRuntime()`：复用现有 load 路径中“文件已读取、启动副作用尚未执行”的步骤。

模块保留完整 `load/save` 兼容入口；settings persistence 不接管本地面板的 save trigger。

### 三套系统的关系

```
SettingsPersistence.initialize()
  ├── legacy: configs.json
  ├── shared module: custom-module.config.json
  └── dedicated: gpt.config.json / toggl.json

本地写入
  ├── legacy → plugin.saveConfigs() (10s debounce)
  ├── shared module → whole-file save (5s debounce)
  └── dedicated → 模块现有 save() (2s debounce)
```

模块的 `declareModuleConfig.load()` 接收该模块 key 下的值，并必须支持重复 apply；`dump()` 返回相同 scope 的当前 runtime settings。

---

## 同步后的 Settings Reconciliation

SiYuan 3.7.0 在同步合并改变 `/storage/petal/<plugin>/` 时调用 [`FMiscPlugin.onDataChanged()`](/src/index.ts)，但不提供变化文件名，也不等待 Promise。fmisc 的同步入口保持 `void`，只调度 `SettingsPersistence` 队列；禁止调用基类实现，因为基类会完整重启插件。

每个 scope 保留 `lastSeenDisk` 与 `lastAppliedRuntime`：

| 条件 | 行为 |
|---|---|
| disk 未变化 | 跳过 |
| disk 等于当前 runtime | 仅刷新 snapshots；覆盖本地 save 未通知 coordinator 的情况 |
| runtime 不等于 last applied | 视为本地未保存编辑，保留 runtime |
| runtime clean 且 disk 变化 | 调用该 scope 现有 apply 操作 |
| 已存在的文件/section 被删除 | 运行期间不 reset；下次正常启动应用 defaults |

粒度：legacy 为 group/key，shared module 为 module key，dedicated 为整文件。一次 run 只读取 `configs.json`、`custom-module.config.json`、GPT/Toggl dedicated files；cache/history/assets 变化只造成这些固定文件的无变化检查。

apply 顺序固定为 legacy（暂存 Enable）→ shared module → dedicated → 设置描述符 → sequential `toggleEnable()`。因此远端启用模块时，模块启动前已获得最新 shared/dedicated settings。队列合并并发通知；一个 scope 失败不阻塞其他 scope，日志只记录 scope 和操作。

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
        this.settingsPersistence = await initSetting(this);
        await load(this);              // 设置完成后加载各模块
    }

    onDataChanged(): void {
        this.settingsPersistence.scheduleReconcileAfterStorageSync();
    }

    async onunload() {
        this.settingsPersistence.dispose();
        await unload(this);
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
