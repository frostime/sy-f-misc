# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，
并遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [7.18.2] - 2026-11-06

### Added

- 模型配置新增「价格」一行：输入/输出单价（每 1M tokens）与货币单位。价格只做记录与展示、不参与计费，用于对比不同中转站对同一模型的报价。
- 对话工具条的模型选择改为自绘面板：按 provider 分组、支持搜索与方向键/回车选择；行内只显示模型名、能力图标和最淡的一档价格，悬浮可查看服务类型、上下文长度、完整标价、`baseUrl`，以及同款模型在各 provider 的报价（按输入价升序）。
- 内置模型预设补充官方标价并更新模型阵容：GPT-6 Astra / 6.1 Sol / 6.1 Terra / 6 Luna、GPT-5.6 Sol、Claude Fable 5.1 / Opus 5.5 / Sonnet 5.5 / Haiku 5.5、Gemini 4 Argon / 3.8 Flash / 3.7 Flash / 3.1 Pro、DeepSeek Flash、GLM-5.3 / 5.3-Flash / 5.1 / 5、Qwen3.8。

### Changed

- 模型标价的计价单位由「每 1K tokens」改为「每 1M tokens」（`inputPerK`/`outputPerK` → `inputPerM`/`outputPerM`）。旧配置在 schema 3.6 迁移中按 ×1000 自动换算，不会丢失历史标价。
- 可选模型清单统一由 `listAvailableModelEntries()` 枚举，`listAvialableModels()` 改为派生。设置页「默认使用模型」与文档内浮动对话的模型下拉行为不变，标签尾部新增价格提示。
- 模型编辑面板的价格输入合并为一行，不再单独占用版面。
- 档位价格不同的变体一律不记价，避免套用错档价格：`*-flash-lite`、GLM-5 的 Air/Lite、GLM-5-Turbo，以及未公布正式价的 GLM-5 其他版本。

### Removed

- 预设移除已下线或过时的模型：GPT-4o / 4.1 / 5 / 5.1、DeepSeek V3 / V3.1 / V3.2 / R1 / chat、GLM-4.x、Qwen3 / QwQ / Qwen-VL。这些名字不再命中预设、回落到默认配置；已存在 provider 中的模型配置不受影响。

## [7.18.1] - 2026-11-04

### Added

- GPT 设置的 Provider 配置移到第二个标签页，排在「Prompt 模板」之前。
- Provider 编辑弹窗新增「测试连接」：用第一个启用的 chat 模型发起一次最小对话请求，显示耗时与模型名；失败时可在弹窗中查看完整错误并复制。
- Provider 列表支持一键复制/粘贴：复制内容包含完整配置与 API Key（剪贴板中以混淆形式保存），粘贴后的副本命名为 `<原名>(Paste)`，重名时自动递增序号。

### Changed

- 设置窗口底色与面板内部统一，并去掉内容区外层留白；模块分组框线和分区标题改用中性色，不再使用蓝色边框与虚线。
- GPT 设置面板去掉多余的横向内边距，标签栏与内容左右对齐；面板内单行输入框宽度上限从 240px 放宽到 360px，长模型名和 API Key 不再显示不全。
- Provider 编辑弹窗合并为左右两栏：左栏 Provider 配置（保留 Base URL 的「当前方案」实时预览），右栏模型列表与选中模型配置；选中项在列表中高亮、配置区标题标明正在编辑的模型，打开弹窗时默认选中第一个模型。去掉标签页，字号与缩放保持原样，弹窗改为贴边显示。

### Fixed

- 修复右键顶栏图标时同时弹出思源内置顶栏图标管理菜单的问题，现在只打开 F-Misc 设置。

## [7.18.0] - 2026-11-02

### Added

- GPT 新增「思源原生 MCP」工具组：复用本机思源 `/mcp` 暴露的原生工具，模型名为 `sy_mcp_<原名>`。该组默认关闭，组内工具默认不选，每次执行前确认；发现失败或输入 Schema 无法无损表示时只影响该组，不影响普通聊天与本地工具。

### Changed

- GPT 工具调用统一保存原生 assistant/tool 消息，移除旧的 Legacy 压缩日志生成方式；旧记录仍可显示、续聊和导出。设置中的「工具调用模式」随配置迁移删除。
- 工具输出默认上限提高到 32768 字符；`limit` 不再是所有工具共用的隐藏参数，只有参数表中声明它的工具接受该参数。截断后不再有变量或缓存可取回：需要完整内容时使用工具自身的分页/范围参数，脚本类输出改为保留首尾（stderr 不再在开头被截断时直接丢失）。
- Claude/Gemini 的协议回放数据只保留无法从正文重建的原生内容（thinking 签名、加密块、服务端调用 id、块顺序）。编辑回答正文后，该消息不再使用旧回放数据；OpenAI-compatible 的同源请求会回传原始 reasoning 字段。
- 修复三协议通信：请求与解析使用同一个最终流式模式；HTTP 错误、流内错误、异常响应结构和提前结束返回明确失败，并保留已收到的正文与用量；工具链不把模型请求失败记为完成；Claude thinking 预算与输出上限矛盾时在发请求前报错；Claude/Gemini 工具 Schema 不再丢失根部约束；Gemini 工具调用按服务端 id 关联，流式分片不再丢调用。

### Removed

- 移除隐私屏蔽功能，包括发送前屏蔽、回复恢复、上下文关键词屏蔽和对应配置页面。原有隐私配置保留在设置文件中供参考，但不再生效；升级时曾启用该功能的用户会收到一次提示。如有隐私顾虑，请从源头处理，例如使用隐私笔记本、避免在笔记中明文记录敏感信息。
- 移除工具临时变量系统，包括 `ListVars`/`ReadVar`/`WriteVar`、`$VAR_REF{{}}` 参数引用、变量管理页面和工具结果缓存文件；Rule 文档改为用 `read-rule` 只读读取。

## [7.17.1] - 2026-10-29

### Added

- 附件文件模块新增 `/new-svg` 命令：输入 SVG 代码后保存为资源文件，并在当前编辑位置插入图片。
- 文本附件和 SVG 图片的右键菜单新增 `Edit Asset File`，支持编辑常见 UTF-8 文本资源并保存回原文件。

## [7.17.0] - 2026-10-24

### Changed

- Html Page 支持 Webview 模式，并保留登录状态

## [7.16.2] - 2026-10-20

### Added

- GPT 配置文件 (gpt.config.json) 中的 API key 改为混淆存储：落盘不再是可识别明文，避免被一眼直接拿走；运行时和设置界面仍为明文，编辑体验不变。首次启动自动迁移旧明文。**注意：多设备同步场景需将所有设备同步升级到本版本，旧版本插件读取新密文会导致请求失败**；密钥随插件打包，不防针对性破解，仅防窥看。

### Changed

- GPT 思维链在流式生成过程中改为纯文本显示，完成后才渲染为 Markdown，避免未写完的片段被反复解析。

## [7.16.0] - 2026-10-06

### Added

- GPT 对话树支持剪切选区为新对话、删除选中内容；执行前预览实际移除和保留范围，支持返回调整，保留其他分支依赖的公共路径。
- GPT 消息用量支持展开查看缓存读写与推理 token 明细，按消息版本保存和展示，切换版本时同步切换。
- 新增历史 JSON 脱水脚本，保留原始 ID、树结构和消息版本，移除正文、附件等隐私内容，方便排查问题。
- GPT 对话菜单新增「检查残留与断链」：按关联组可视化图外记录，查看全部版本、时间、模型和估算占用量，审查确认后清理；清理前需明确保存并核验完整备份，不自动重连或修改正常树节点。

### Changed

- GPT 归档、导出与复制链接分别执行；导出和复制不再隐式保存永久历史。更新永久存档前确认目标文件与覆盖范围。
- 残留清理拆为「保存清理前完整备份」与「清理当前工作版」两个步骤；清理后永久存档仍需另行确认更新。
- GPT 对话树改为浏览与选择两个状态：单击增选/取消节点，节点菜单负责加入或排除整棵子树、显式补齐连接路径；不连通选区可删除，复制/剪切需先连通。
- OpenAI-compatible、Claude、Gemini 的思维链与正文分离，流式生成时可实时查看，完成后独立折叠展示。

### Fixed

- 修复永久历史文件写入失败仍被当作成功的问题，避免未写成的备份授权清理；备份需读回核验，丢失、变化或来源变动时拒绝清理。
- 修复删除节点、清空和载入历史时未真正移除旧记录的问题，避免产生图外残留或混入其他对话的节点；已有残留不自动清理。
- 修复图外残留阻挡正常子树剪切、删除的问题，树图与操作统一使用从根节点可达的结构，不因当前激活分支或消息版本改变处理范围。
- 修复历史结构异常导致节点菜单无法打开的问题，关联提示支持可读摘要、定位和高亮。
- 修复剪切保存失败时的回滚处理，先保存目标对话，再移除来源内容，避免内容丢失。
- 修复三种协议的流式与非流式 usage、缓存及思维链解析，避免重复计数或将未报告用量显示为零。
- 修复 rerun 继承旧版本用量、思维链和耗时，以及生成结果写入错误版本的问题。

## [7.15.0] - 2026-07-07

### Changed

- **GPT 内置工具组精简**：文件系统工具聚焦查看与编辑，脚本工具组保留 Shell、Python 和 JavaScript，减少重复工具与规则提示。
- **Zotero Bridge 0.2.0**：扩展 Zotero 兼容范围至 9–10，并支持独立版本发布与自动更新。

### Fixed

- 修复 Zotero 导入笔记时行内公式和块级公式丢失或未渲染的问题；导入后会立即触发公式渲染。
- 修复 SiYuan 3.8.0+ 设置面板侧栏布局异常问题，固定侧栏宽度为 200px，避免侧栏与内容区挤压或重叠。

### Removed

- 移除 GPT 内置的 JSON 转 TypeScript 接口、Pandoc、`fs-Glob`、`fs-Grep`、`fs-List`、`fs-Inspect` 和 `fs-FileOps` 工具。

## [7.14.1] - 2026-08-04

### Changed

- **GPT Chat 消息布局优化**：将用户/助手头像与角色名称、时间戳合并至同一行，减少左侧空间占用并扩大消息正文可用宽度。

### Fixed

- 修复 SiYuan v3.7.0 重构 AI 配置后“思源内置模型”无法使用的问题；现在会读取当前启用的 AI 编辑模型，未配置时隐藏该选项并显示明确状态。

## [7.14.0] - 2026-07-30

### Changed

- **设置同步机制重构**：适配思源插件数据同步；同步 fmisc 数据不再重启插件，活动中的 GPT 对话保持运行，设置会在当前实例中更新。

## [7.13.1] - 2026-07-07

### Changed

- **Zotero 模块重构**：移除 Better BibTeX debug-bridge 依赖，改用 Zotero Local API 读取笔记数据、自研 Bridge 扩展获取当前选中条目。不再需要配置 `zoteroPassword`/token。
- 删除 `globalThis.ZoteroSDK.executeJSCode()`；`checkConnection()` 保留。
- Zotero 配置存储迁移：`zoteroPassword` 迁移至 `custom-module.config.json`，`zoteroDir` 继续使用独立文件 `zoteroDir.config.json`。

### Added

- 支持 Zotero v9+。
- Zotero Bridge 扩展自动更新：通过 `raw.githubusercontent.com` 托管 `updates.json`，Zotero 每 24h 检查更新。
- 设置面板新增「检查连接」按钮，区分 Local API 和 Bridge 扩展状态。
- 设置面板新增「迁移指南」按钮和废弃 Token 提示，引导旧用户迁移。
- 首次使用 Zotero 功能时自动弹窗显示迁移文档。
- 新增 `zotero-migration.md` 迁移指南。

### Fixed

- 修复 Zotero 缺少显式 `dump()` 导致 `zoteroDir` 单设备值被错误写入会跨设备同步的 `custom-module.config.json` 的问题。

### Removed

- 删除 `src/func/zotero/js/*.js`（8 个 Zotero 注入脚本）。## [7.13.1] - 2026-06-26

### Fixed

- 修复 GPT 临时对话保存时 localStorage 超额导致对话框无法关闭的问题。

## [7.13.0] - 2026-06-24

### Added

- **Standard 工具调用模式**（默认）：工具调用 turn 以原生 `IMessage[]` 序列持久化与回放，续对话时向 LLM 发送真实的 `assistant(tool_calls)` + `role:tool` 消息序列，对齐 OpenAI 标准协议。
- **CodeX 式交错渲染**：assistant 文本段与 tool 调用行在主区域内联显示；中间文本段折叠为摘要、点击展开，末条回复默认展开。
- **Standard turn 多段编辑面板**：右键编辑支持修改所有 assistant 文本段（中间 + 最终），tool 调用行只读展示。
- **Standard cell 导出**：SiYuan 文档与 XML 导出输出 assistant 文本段 + tool 调用块交错结构，替代原有单一回复 + JSON 块格式。
- 每会话 `toolCallMode` 配置项（Standard / Legacy），新建会话默认 Standard。

### Changed

- 旧会话与 Legacy cell 自动沿用 Legacy 回放，无需数据迁移。
- `tool-call/` 相关 spec-doc 随 Standard 模式更新。

### Fixed

- 修复 Standard cell 编辑面板内容缩窄与 tool 行 icon 偏移的布局问题。

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

[Unreleased]: https://github.com/frostime/sy-f-misc/compare/v7.18.2...HEAD
[7.18.2]: https://github.com/frostime/sy-f-misc/compare/v7.18.1...v7.18.2
[7.18.1]: https://github.com/frostime/sy-f-misc/compare/v7.18.0...v7.18.1
[7.18.0]: https://github.com/frostime/sy-f-misc/compare/v7.17.1...v7.18.0
[7.17.1]: https://github.com/frostime/sy-f-misc/compare/v7.17.0...v7.17.1
[7.14.1]: https://github.com/frostime/sy-f-misc/compare/v7.14.0...v7.14.1
[7.14.0]: https://github.com/frostime/sy-f-misc/compare/v7.13.1...v7.14.0
[7.13.1]: https://github.com/frostime/sy-f-misc/compare/v7.13.0...v7.13.1
[7.13.0]: https://github.com/frostime/sy-f-misc/compare/v7.12.1...v7.13.0
[7.12.1]: https://github.com/frostime/sy-f-misc/compare/v7.12.0...v7.12.1
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
