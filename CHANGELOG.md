# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，
并遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [7.12.1] - 2026-06-17

### Added

- 新增 `max` reasoning effort 级别。
- 新增 DeepSeek V4 Pro 模型预设。
- Qwen3 预设补全 thinking 配置，匹配范围拓宽至 `qwen3-30b`、`qwen3-max` 等变体。
- Effort 兼容配置新增帮助文档，按协议/模式展示实际发送行为；Claude adaptive 模式支持自定义 effortMap。
- 新增 `gpt-chat-history-persistence` spec-doc，定义 GPT 对话历史持久化的概念模型与行为边界。

### Changed

- GPT 对话缓存写入改为增量式 pending redo log 机制：单次对话变更不再触发 unload 时全量重写最近 36 个 cache 文件，降低思源同步批量写入。
- 缓存文件写入/删除改为直接检查 SiYuan file API 响应码，避免 API 静默失败导致 pending 状态误清除。

### Fixed

- 修复 Claude thinking effort 发送位置错误及 `effortMap` 未生效的问题。
- 修复非 OpenAI 协议下 effort 归一化结果未正确传递的问题。

## [7.12.0] - 2026-06-14

### Changed

- GPT 对话缓存从单文件 `gpt-chat-cache.json` 拆分为 per-session 文件 `gpt-cache/{session-id}.json`，降低思源同步与历史快照膨胀。

### Added

- 桌面端 GPT 持久化读取支持 Node fs 优先、SiYuan API 兜底。
- 旧缓存自动迁移与迁移状态保护；迁移期间保留旧缓存文件作为备份。

## [7.11.6] - 2026-06-08

### Added

- GPT 对话树支持提取子树为独立对话分支。

### Fixed

- 修复对话树操作过程中视口位置跳动的问题。
- 修复子树提取后的稳定性问题。

## [7.11.5] - 2026-05-31

### Added

- 新增 GPT 对话 XML 导出功能，支持选择是否包含版本历史、推理内容和隐藏消息。

## [7.11.4] - 2026-05-30

### Fixed

- 修复工具调用链中未正确应用用户 option toggle 设置的问题。

## [7.11.3] - 2026-05-29

### Fixed

- 修复 VFS 中 `exists` 判断目录条件错误的问题。

## [7.11.2] - 2026-05-16

### Added

- 资源文件仪表盘支持嵌套目录浏览。

## [7.11.1] - 2026-05-16

### Fixed

- 兼容 SiYuan v3.7.0。

### Removed

- 清理归档的 sspec change 文档。

## [7.11.0] - 2026-05-04

### Added

- 新增 Chat Option 参数 toggle 机制与模型级 compat 兼容性配置（`ILLMOptionCompat`），替代散落的 `capabilities` / `unsupported` 逻辑。
- Reasoning effort 支持模型级 `supportedEfforts`、`effortMap`、`budgetMap` 配置。
- Provider 设置面板新增 Thinking 风格选择（OpenAI / DeepSeek / Qwen）与 Claude Thinking 模式选择（adaptive / manual-budget）。
- 新增 Diff Edit 工具，支持结构化文件编辑。

### Fixed

- 修复 Claude & Gemini 协议未应用 option toggle 变更的问题。
- 修复 reasoning effort 设置中 thinking 开启时温度滑块仍可操作的问题。
- 修复 reasoning 菜单中显示不适用于当前模型的 effort 级别的问题。

### Changed

- Provider 设置面板重构，拆分为基本配置与模型列表两个 Tab。
- 文件名 `adpater.ts` 更正为 `adapter.ts`。

## [7.10.0] - 2026-02-26

### Added

- 新增 Claude Native 与 Gemini Native 协议支持，不再依赖 OpenAI 兼容层转发。
- 新增 Context 7 集成。

## [7.9.4] - 2026-02-10

### Added

- 新增 Docky 配置项 `DockyProtyleList`（schema v2）。

### Fixed

- 修复 ModuleConfig 保存失败的问题。
- 修复提取序列为新对话时的错误。

### Changed

- 优化 Docky 交互体验。

## [7.9.3] - 2026-02-10

### Changed

- HSPA 框架迁移至 Alpine.js。
- System prompt 面板支持查看完整内容。

### Fixed

- 修复消息开头显示完整时间戳的问题。

## [7.9.2] - 2026-02-09

### Added

- 新增 Skill Rule 功能。

### Changed

- 重构 fs 工具组。
- 优化列表显示效果。

## [7.9.1] - 2026-02-09

### Changed

- Permission 机制完全重构。
- Diff Edit 工具改用 SEARCH/REPLACE 格式。
- HSPA 不再使用 confirm/alert 原生弹窗。

### Fixed

- 修复旧版本 permission 字段迁移错误。

## [7.8.0] - 2026-01-09

### Added

- 新增 Permission 机制。
- 新增 HSPA（HTML Single Page Application）框架。
- 新增 BlockContent slice 参数支持。

---

_7.8.0 之前的版本记录请参考 git log。_

[Unreleased]: https://github.com/frostime/sy-f-misc/compare/v7.11.6...HEAD
[7.12.0]: https://github.com/frostime/sy-f-misc/compare/v7.11.6...v7.12.0
[7.11.6]: https://github.com/frostime/sy-f-misc/compare/v7.11.5...v7.11.6
[7.11.5]: https://github.com/frostime/sy-f-misc/compare/v7.11.4...v7.11.5
[7.11.4]: https://github.com/frostime/sy-f-misc/compare/v7.11.3...v7.11.4
[7.11.3]: https://github.com/frostime/sy-f-misc/compare/v7.11.2...v7.11.3
[7.11.2]: https://github.com/frostime/sy-f-misc/compare/v7.11.1...v7.11.2
[7.11.1]: https://github.com/frostime/sy-f-misc/compare/v7.11.0...v7.11.1
[7.11.0]: https://github.com/frostime/sy-f-misc/compare/v7.10.0...v7.11.0
[7.10.0]: https://github.com/frostime/sy-f-misc/compare/v7.9.4...v7.10.0
[7.9.4]: https://github.com/frostime/sy-f-misc/compare/v7.9.3...v7.9.4
[7.9.3]: https://github.com/frostime/sy-f-misc/compare/v7.9.2...v7.9.3
[7.9.2]: https://github.com/frostime/sy-f-misc/compare/v7.9.1...v7.9.2
[7.9.1]: https://github.com/frostime/sy-f-misc/compare/v7.8.0...v7.9.1
[7.8.0]: https://github.com/frostime/sy-f-misc/releases/tag/v7.8.0
