---
change: "chat-options"
revision: 002
created: 2026-05-03
status: implemented
---

# Revision 002 — Session reasoning / quick menu cleanup

## Trigger

用户在对话内设置与快捷菜单联调时，发现 reasoning_effort 的“空值 / 不设置”语义、toggle 状态、以及快速菜单的表现不一致。

## Problems

1. **Session Setting 中的 `Reasoning Effort` 存在冗余语义**
   - `"不设置"` 是旧版迁移妥协产物
   - 当前已经有 `chatOptionToggles.reasoning_effort` 作为“是否发送”的主控制
   - 在设置页继续保留 `"不设置"` 会导致 `toggle` 与 value 双重语义冲突

2. **历史数据可能存在脏配置**
   - `chatOptionToggles.reasoning_effort = true`
   - 但 `chatOption.reasoning_effort = '' / undefined`
   - 这种状态下 UI 可能显示正常，但运行语义不明确

3. **快速菜单（main.tsx）温度项未按 toggle 状态禁用**
   - toggle=false 时仍可操作 slider
   - label 也仍显示数值，而不是 `API 默认`

4. **快速菜单缺少 reasoning_effort 快捷入口**
   - 当前只有温度的临时调整
   - reasoning_effort 是更高价值的快捷项，应该补齐

## Proposed Changes

### A. Session Setting：去掉 `"不设置"`

- `src/func/gpt/setting/ChatSetting.tsx`
  - 删除 `Reasoning Effort` 下拉中的 `"不设置"`
  - 下拉只保留真实 effort 值
  - `toggle` 负责“发 / 不发”语义，不再通过空字符串表示清空

### B. Migration：在本次 schema 变更中清理脏数据

- `src/func/gpt/model/config_migration.ts`
- 修复必须并入**当前 schema 迁移逻辑**，不允许新增独立的运行时自检或临时修复分支
- 在本次 schema 变更对应的迁移步骤中，如果发现：
  - `chatOptionToggles.reasoning_effort === true`
  - 且 `chatOption.reasoning_effort` 为空 / 空字符串
- 则迁移时自动修正为：
  - `chatOptionToggles.reasoning_effort = false`
- 这类旧状态不应通过默认值兜底，也不应在运行时偷偷修补，而应作为 schema 升级的一部分显式清理

### C. Quick Menu：温度跟随 toggle 状态

- `src/func/gpt/chat/main.tsx`
  - 温度 toggle=false 时：
    - slider disabled
    - label 显示 `API 默认`
  - toggle=true 时：按数值显示

### D. Quick Menu：增加 reasoning_effort

- `src/func/gpt/chat/main.tsx`
  - 新增 reasoning_effort 快捷菜单项
  - 菜单内可保留 `"不设置"` 作为临时清空入口（仅快捷菜单允许）
  - 但其语义要明确：这是“临时覆盖”，不是设置页的长期状态

## Clarified Semantics

- **Settings page**：
  - `toggle` 是唯一“发 / 不发”开关
  - 不再使用 `"不设置"` 作为 reasoning 力度值

- **Quick menu**：
  - 可以保留 `"不设置"`
  - 但仅作为临时操作

- **Historical dirty config**：
  - 必须在本次 schema 迁移中修复
  - 不靠运行时默认值兜底
  - 不新增独立临时检查逻辑

## Recommendation

先做最小修复：
1. 去掉 Session Setting 中 reasoning 的 `"不设置"`
2. 补 migration 清理脏值
3. 让 quick menu 的 temperature 跟随 toggle
4. 增加 reasoning_effort quick menu

这样可以把“是否发送”与“具体值”彻底解耦，并修掉当前测试暴露的问题。
