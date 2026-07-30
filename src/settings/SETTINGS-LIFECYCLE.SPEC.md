---
title: Settings Lifecycle Specification
description: fmisc 设置初始化、本地保存、同步 reconciliation、冲突优先级与恢复边界
scope:
  - /src/index.ts
  - /src/settings/**
  - /src/func/types.d.ts
  - /src/func/index.ts
updated: 2026-07-28
---

# Settings Lifecycle Specification

## Responsibility

`SettingsPersistence` 负责协调设置生命周期：启动导入、legacy/shared 本地保存触发、同步后的 reconciliation、scope 快照、apply 顺序和失败隔离。

配置 schema 与 runtime 映射仍由原所有者负责：legacy 配置由 `FMiscPlugin` 读写，shared module settings 由 `declareModuleConfig` 映射，dedicated settings 由 `declareDedicatedSettingsStorage` 映射。Settings lifecycle 不得创建并行 serializer、替换现有 migration，或在 settings apply 中执行 feature startup 副作用。

## Storage Contracts

| Storage | Reconciliation scope | Local save | Runtime apply owner |
|---|---|---|---|
| `configs.json` | 单个 group/key | 10 秒 debounce | `FMiscPlugin.applyConfigs()` / legacy side effects |
| `custom-module.config.json` | 单个 module key | 5 秒 debounce，整文件写入 | `declareModuleConfig.load()` |
| `gpt.config.json` | 整个文件 | 2 秒 debounce | GPT dedicated settings declaration |
| `toggl.json` | 整个文件 | 2 秒 debounce | Toggl dedicated settings declaration |

`zoteroDir.config.json` 是设备本地配置，不参与同步 reconciliation。GPT cache、history、assets 与 module source files 也不属于 settings lifecycle。

文件名、payload schema、migration、默认值和 debounce 周期是兼容性合同。修改 settings lifecycle 时不得顺带改变这些合同。

## Startup Contract

启动顺序必须保持：

```text
legacy settings
→ shared module settings
→ dedicated GPT/Toggl settings
→ feature module startup
→ active
```

所有 settings 在 feature modules 启动前完成首次导入，包括当前未启用模块的 dedicated settings。未启用模块只能初始化 settings runtime，不得注册命令、菜单、Dock、listener，或执行网络和脚本启动操作。

SiYuan 可能在异步 startup 完成前调用 `onDataChanged()`。`FMiscPlugin` 在 startup 期间只保留一个 pending notification，进入 `active` 后最多触发一次 reconciliation。`onDataChanged()` 必须保持同步且不得调用 SiYuan 基类实现；基类实现会卸载并重载插件。

## Reconciliation Contract

SiYuan 的 storage notification 不包含变化文件路径。每次 reconciliation 读取全部已知 settings 文件；cache-only 同步因此只产生固定文件的 unchanged 判断，不得触发 settings apply 或 feature side effects。SiYuan `loadData()` 对缺失文件返回空字符串；settings lifecycle 必须将 `""` 视为 missing，而不是有效配置。

每个 scope 保存：

- `lastSeenDisk`：上次成功确认的存储值；
- `lastAppliedRuntime`：上次成功 apply 后的 runtime 值；
- `diskExisted`：该 scope 是否曾存在于存储中。

决策顺序由 `/src/settings/reconcile-decision.ts` 定义，语义必须保持：

| 条件 | 结果 |
|---|---|
| scope 当前不存在且此前存在 | 延迟删除；当前 session 保留 runtime |
| disk 与 `lastSeenDisk` 相同 | unchanged |
| disk 已等于当前 runtime | 只刷新 snapshots |
| runtime 与 `lastAppliedRuntime` 不同 | 当前 session 保留本地 runtime |
| runtime clean 且 disk 变化 | apply disk |

当前 session 的 runtime 优先级不精确区分本地 debounce save 是否已经完成。只要 runtime 偏离 `lastAppliedRuntime`，同 scope 远端值就可能等到 runtime 再次收敛或插件重启后才生效。不要在没有完整 save acknowledgement 设计时把该行为描述为“仅未保存设置优先”。

一次 run 的 apply 顺序必须保持：

```text
legacy values（暂存 Enable transitions）
→ shared module settings
→ dedicated settings
→ settings descriptors
→ sequential Enable transitions
```

该顺序保证远端启用模块时，模块在启动前已经获得本轮最新 settings。并发 notification 合并为当前 run 后最多一个 pending rerun，不允许两个 reconciliation run 并发 apply。

## Side-Effect Boundary

同步 apply 只更新 settings runtime：

- GPT 不重扫自定义脚本、不改变 startup-only Dock、不修改进行中的请求；
- Toggl 不立即重新获取账户、projects 或 tags；
- Enable transition 复用模块现有 `load()` / `unload()`；
- 文件或 section 删除不在当前 session 实时 reset。

现有完整 load/save 入口仍须可用，并继续组合原有 read、apply、migration、startup 或 save 行为。

## Failure And Recovery

读取或 apply 一个 scope 失败时：

- 保留其他独立 scope 的处理；
- 不记录配置 payload、token、prompt 或其他敏感值；
- 日志必须包含 `[fmisc]`、operation、file/module/scope 和可执行的 UI reload 建议；
- 不承诺对已经部分执行的 apply 做事务回滚。

`dispose()` 阻止新 reconciliation 和后续 pending rerun。已经开始的 startup、apply 或 Enable transition 可能在 disposal 后 settle；teardown 是 best-effort。若低概率生命周期交叉造成菜单、Dock、listener 或 runtime settings 不完整，用户可通过 SiYuan UI reload 清除当前前端 JavaScript realm。

UI reload 不是持久数据损坏、安全、隐私或高频同步错误的兜底。这些情况仍必须由实现预防或提供专门恢复机制。

## Change Rules

修改 settings lifecycle 时必须验证：

1. reconciliation decision tests 覆盖 unchanged、already-current、session runtime precedence、remote apply 和 deletion deferral；
2. module failure isolation、type-check 和 production build 通过；
3. 旧配置文件名、payload builders、migration 和 debounce 周期未变化；
4. cache/history/assets 没有被纳入 settings apply；
5. 真实双设备同步与旧工作区导入仍需 SiYuan 应用内验收。
