# GPT 工具清理与思源原生工具接入：Plan

目标见同目录 `gpt-tools-cleanup.TARGET-SPEC.md`，技术依据见 `gpt-tools-cleanup.METHOD.md`，已接受的代码分布与实施对照见 `gpt-tools-cleanup.SHAPE.md`，独立评审与修订处置见 `gpt-tools-cleanup.ARCH-REVIEW.md`。本计划按 PLAN skill v3 区分问题、执行步骤和阶段门槛。分支为 `refactor/gpt-tools-cleanup`；MCP 源码已接入，本次 checkpoint 保存当前实现、测试和文档，不包含后续启动恢复或命令注册修复，不自动合并或推送。

## Mainline

- **P0 · Git 与工作基线 — 完成。** 附件分支合入 main 为 `32f7ad3`；本分支初始规划为 `34c2ea1`。不要重新合并附件分支或再切一个开发分支。
- **P1 · 旧工具机制清理 — 源码/自动回归完成，宿主验收未完成。** `b4a05f9` 解决 [I1]–[I5]。115 项测试和两种构建通过；验证边界见下表，[I8] 仍需宿主证据。
- **P2 · MCP 有限可行性与规模调查 — 完成。** `12c7ca9` / `5e1b57f` 保存官方控制机制与 dev 3.8.8 运行证据。[I6] 的最小通路通过，[I11] 的事实依据齐备；这不代表工具选择或审批默认值已获准。
- **P3 · 确定接入合同 — 完成。** 用户审阅 SHAPE/独立评审处置后回复“方案大致 Ok，请开始”；整工具选择、默认审批、启动快照和首版边界已收口，不重复询问。dev 浏览器同源通路的最小验证通过，不需要新增依赖或认证平台。
- **P4 · 原生工具组纵向切片 — << CURRENT（源码/自动回归完成，完整插件宿主路径待验）。** [I7] 已接入同步工厂、全局设置及执行链路，独立源码复核与相关修订完成；生产组件在 dev renderer 通路通过。出口仍需已加载候选插件的 UI、真实 Provider 及版本交互证据，不能用组件探针代替。
  - 若已验证的轻量路线在宿主中不成立，或需要新增依赖/通用传输平台 → 更新 METHOD 并带证据回到用户，不自动安装 SDK、添加重连/回退框架。
- **P5 · 宿主验收与收尾 — 未开始。** 完成 [I8]，重跑相关回归并报告 [I12]/[I13] 的状态。出口：Agent 检查无本轮新增回归、用户确认必要宿主体验；已有失败不能写成通过。是否合并由用户确认，不自动推送。

### 清理检查点的验证证据

以下表格只对应 `b4a05f9` 的清理基线，不代表本轮 MCP 的结果；本轮最终验证在 Current Phase。

| 检查 | 结果与边界 |
|---|---|
| `pnpm run test:gpt` | 98/98：聊天 40、协议 42、归档 5、工具 11 |
| `pnpm run test:runtime-config` | 7/7；脚本会清理精确目标 `tmp/runtime-config-tests`，重跑前确认该目标安全 |
| `pnpm run test:html-pages-webview` | 10/10 |
| `pnpm run build:publish` / `build:private` | 均通过，均包含 GPT |
| `pnpm run type-check` | 5 个基线诊断，[I12]；无本轮新增诊断 |
| `pnpm run test:gpt-tree-menu` | iframe Alpine/节点初始化超时，旧快照同样失败；未进入菜单断言，[I13] |

新增工具测试使用真实 executor、规则、工具链、结果转换及 TreeModel/lifecycle，只替换模型/宿主边界；覆盖版本/分支隔离及旧 payload 保留。不代表真实 Provider 或个人宿主 UI 已验收。

## Current Phase

### 目标与边界

P4 按已接受 SHAPE 实施 [I7]/[I15]，不建设通用 MCP 平台，不动聊天树/持久化、Provider 转换器、Tool Hub 或其他审批/取消基线问题。用户仍要求后续实质行为/架构变化先讨论；本轮授权不消除该边界。

### 已完成与下一步

1. GPT 启动一次发现、5 秒失败隔离、统一就绪渲染/取消、静态原生组、单工具默认与审批、schema/结果转换、冲突隔离及最小权限页修复均已实施。两个新增生产文件集中协议和适配；没有新增依赖。
2. 分工为 transport/client 与启动集成测试的独立 worker；主代理负责桥接、默认/面板、GPT 生命周期和整合。实现后另做只读代码复核；主代理核实并修正取消后仍显示加载、无效 text 内容误报不支持类型的问题。所有任务已返回，无在途构建或探针。
3. 已按 SHAPE 对照实际 diff：生产净增约 565 行，在预测内；测试扩为约 814 行（含边界 fixture/runner），用真实启动 owner 和传输分层回归替代复制状态机，未扩大产品职责。见 SHAPE 实施对照。
4. 下一步确认候选构建实际加载到哪个思源前端，再做全局/聊天面板、审批、真实模型调用、重开标签/旧历史与版本交互验收。[I8] 的清理宿主检查可同时进行，但证据要分别记录。

### 本轮最终验证（2026-10-31，当前工作区）

| 检查 | 结果与边界 |
|---|---|
| `pnpm run test:gpt` | 117/117：chat 40、protocol 42、archive 5、tools 30；最后源码复核修订后重跑通过 |
| `pnpm run test:runtime-config` | 7/7；已确认精确生成目录安全后运行 |
| `pnpm run test:html-pages-webview` | 10/10 |
| `pnpm run build:publish` / `build:private` | 均通过，最终两种构建已顺序重跑 |
| `pnpm run type-check` | 仍为 [I12] 的原有 5 个诊断，无新增；不是类型检查通过 |
| 生产组件 renderer 探针 | dev 3.8.8，30 工具均可表示；默认/仅开组定义数均 0，勾选 system 后仅 1 个定义，审批 1 次并返回版本，session 已关闭 |
| `test:gpt-tree-menu` | 本轮未重跑；[I13] 的已知初始化失败未修复，不宣称通过 |

最终日志在 `tmp/gpt-mcp-final-*.log`，runtime/html 日志在 `tmp/gpt-mcp-verify-*.log`。隔离 renderer 未加载插件主界面，因此生产组件探针不等于真实插件 UI 或 Provider 已验收。

### 出口与 Now

出口：源码与自动回归保持当前通过状态，且已加载候选插件的 UI/Provider 路径取得真实证据，再进入 P5 整体验收。不擅自合并、推送或修复基线失败。

**Now：按用户要求先保存当前 checkpoint。用户实际窗口的即时 MCP 探针仅 15ms，且用户报告再次重启后恢复；[I16] 的首次启动超时原因和恢复策略仍待收口。[I17] 命令重复注册原因已确认，未修复。不重做默认值讨论，不把恢复提议当成已批准实现。**

## Issues

### I1 · 规则依赖可写变量，读取与生命周期不清

- **Status：done（源码/自动测试）。** 旧系统将 Rule 与临时值混存，读取知识还需变量管理工具。
- **Resolution：** `tools/read-rule.ts` 直接读取注册组的文档，无写入口、无 ReadVar 别名；索引、完整读取与未知名称由 `tests/gpt-tools.test.ts` 保护。实现和永久文档随 `b4a05f9` 保存。

### I2 · 工具结果缓存形成消息之外的隐藏状态

- **Status：done（源码/自动测试）。** 参数/结果变量与 VAR_REF 不能可靠随版本回放，且可旁路拒发结果。
- **Resolution：** 移除普通变量、缓存/引用及 UI/提示消费者；保留 JSON 注入、分页和长度限制。测试确认普通结果无缓存提示、旧引用按字面传递、拒发结果不经变量回流。

### I3 · 规则正文混合通用教程、过时机制与专用协议

- **Status：done（正文及引用核对）。** 不能机械改名为 SKILL，也不能因模型变强删掉插件私有语法。
- **Resolution：** 文件/Web/脚本短约定移入描述；思源 9 主题保持标识并精简，diff/slice 协议保留。旧 3–5 次及复杂任务策略未在本轮改变。

### I4 · 新生成仍可走压缩伪日志，旧历史又须兼容

- **Status：done（源码/自动测试；宿主体验属于 [I8]）。** 删除新路径不能误删历史读取。
- **Resolution：** schema 3.4 删除 toolCallMode；新生成原生消息，旧 userPromptSlice/显示/上下文/导出路径保留，不批量改历史。迁移幂等、版本绑定、旧 payload 不覆盖已测。

### I5 · 旧机制移除后留下失效工具与元数据生产链

- **Status：done。** ToolCallScript 未注册，相关返回类型/压缩/缓存字段无活消费者，执行器 VFS 闲置。
- **Resolution：** 连同定义、生成器和说明清理；共享 VFS、脚本执行/格式化/权限提取不变。Python/PowerShell 生成器语法及合成输入对比通过，用户现有 JSON 未重写。

### I6 · 零依赖复用原生工具的技术路线是否成立

- **Status：done（有限通信，不是完整集成）。** 不用 SDK 仍必须跨越真实握手和调用，不能仅从源码推断。
- **Resolution：** dev 3.8.8 用原生 fetch 完成 initialize、initialized、tools/list、system.version 和 DELETE 关闭 session，协议 2025-03-26。结果与限制在 METHOD；未访问笔记、调用写工具、改权限或输出凭证。

### I7 · 原生 MCP 工具尚未进入现有聊天执行路径

- **Status：in progress（源码/自动回归完成；完整插件宿主证据待补）。** 接入代码、30 项工具回归及生产组件 renderer 验证已完成，详情见本阶段验证表。
- **Blocked by：** [I16]（定位真实插件启动超时）以及已加载候选插件构建的 UI/Provider/交互证据。[I11]/[I14]、接入架构选择与 [I15] 已关闭，不重做产品默认值讨论。
- **Resolution：** 在实际插件 UI 中确认两个选择面板、审批、模型请求和版本回放；自动与组件证据不能代替整条宿主路径，也不扩张成通用 Agent 重构。

### I8 · 清理后的真实宿主兼容性仍缺验收证据

- **Status：needs-spike（可与 P3 独立进行）。** 自动测试未证明个人思源 UI、存量历史与真实审批交互；dev 打开或通信成功都不是该证据。
- **Resolution：** Agent 准备可控检查并确认宿主加载的是待验收构建；检查规则、工具组/手动调用入口、成功结果审批、旧 Legacy 显示/续聊/导出、rerun/切版本/分支及分页。用户确认实际体验，Agent 保留可自动化的验证责任。MCP 实施后须补其对应路径，不能拿清理验收代替。

### I11 · 工具规模与官方控制不能直接决定本地默认选择

- **Status：done（产品选择；实现及验证在 [I7]）。** 30 工具/168 action、模型定义 64,630 字节；官方按整工具暴露而非 action，发现全量不等于应注入全量。
- **Resolution：** 用户本轮确认独立原生组默认关闭，复用单工具选择、按整工具而非 action 筛选，首次及新增工具默认不选。完整规模、示例子集和官方三套控制在 METHOD；不再重复询问初始默认值。

### I12 · 全量类型检查存在清理前的 5 个诊断

- **Status：backlog（不是当前修复范围，不阻塞 P3）。** docfile-tools.ts 四个 DOM unknown 错误；model/storage.ts:65 一个 object/Record 错误。
- **Evidence：** 在隔离的 `34c2ea1` git archive 快照复现相同位置。当前目标是保证不新增诊断，不是将基线失败当成通过。
- **Resolution：** 后续回归单列现有与新增；若用户授权修复基线，再按具体原因拆开处理，不能顺带扩本 change。

### I13 · 树菜单浏览器回归在初始化阶段失败

- **Status：backlog（已证实基线同样失败，不阻塞 P3）。** `test:gpt-tree-menu` 等不到 iframe Alpine/节点，尚未进入菜单断言。
- **Evidence：** 当前与隔离 `34c2ea1` 快照同样失败；没有通过修改断言绕过。
- **Resolution：** 如需修复，先定位测试启动/宿主问题并取得菜单断言运行证据。未解决时明确报告失败，由用户结合 [I8] 决定验收，不宣称套件通过。

### I14 · MCP 不继承 Agent 审批，默认授权方式尚未确定

- **Status：done（产品选择；真实入口验证在 [I7]）。** 30 工具无明确 readOnlyHint，98 个 action 的 effects 为空；混合读写工具不能凭元信息自动当只读。用户许可开发时直连网络不等于模型工具全部自动批准。
- **Resolution：** 用户本轮确认默认每次执行前审批（`ask-always`），成功结果默认直接发送（`never`），保留现有单工具权限覆盖。[I7] 须验证真实审批入口；若依赖旧审批/取消缺陷的修复，先单列具体问题和范围，不自动重做全部权限系统。

### I15 · 权限页面单项修改可能丢失另一项工具默认值

- **Status：done（源码/自动测试）。** 独立评审发现 `tool-permission-manager.html` 更新一个审批字段时，用只有 name 的对象查询另一字段；原生工具默认 ask-always/never 时，仅改结果审批会误保存 auto/always。
- **Evidence：** 主代理已核对页面 `getEffectiveExecutionPolicy` / `updateResultApprovalPolicy`、全局面板完整覆盖保存及 executor 覆盖优先级。细节在 ARCH-REVIEW §3。
- **Resolution：** 按已接受 SHAPE 从页面已有的真实工具计算未修改字段的有效策略，保留原覆盖格式；3 项执行真实页面脚本的回归覆盖单项保存、重置及批量修改。不顺带修复既有 on-error、取消等其他权限缺陷；真实 iframe 交互仍在宿主验收范围。

### I16 · 用户 dev 完整插件 UI 报告启动超过 5 秒

- **Status：needs-spike。** 用户在候选构建中观察到原生 MCP 因超过 5 秒而不可用。还没有失败窗口的请求阶段/时序证据，不能认定调大阈值就能修复，也不能把先前隔离浏览器成功等同于正常插件启动。
- **Evidence：** 2026-10-31 CLI verify 确认 dev 3.8.8、4143。Node 即时握手/清单连关闭共约 142ms。随后用户在实际窗口执行只读探针：origin 为 https://127.0.0.1:4143、renderer/pluginLoaded 均为 true，initialize 4ms、initialized 3ms、tools/list 5ms、DELETE 2ms，总计 15ms、30 工具；用户又报告再次重启后恢复。证明当前窗口通路可用，不证明失败那次启动时序正常，尚不能定位具体阻塞。
- **Resolution：** 用户提出失败后 30 秒有限自动重试或显式按钮。主代理建议先显式重试，也可增加启动失败后仅一次后台尝试；仅握手/发现，绝不重放工具调用。恢复后已有聊天是否仍需重开也必须说清，不能偷偷加入热注册/换绑。用户要求先 checkpoint，尚未选择恢复方案；不改 5 秒或重试策略。临时只读探针在 tmp/diagnose-native-mcp.js，不纳入产品或提交。

### I17 · GPT 关闭/开启后重复注册两个命令

- **Status：needs-discussion（原因已确认，修复未实施）。** 用户日志显示 open-gpt-chat 和 open-gpt-chat-window 的 Command ID 已注册；随后自定义扩展正常加载，说明不是 MCP 协议错误或整体 GPT 启动中断。
- **Evidence：** index.ts:load 每次执行两个 plugin.addCommand，而 unload 不注销命令。当前 SDK 类型只公开 addCommand。此路径在本轮 MCP 之前已存在，本次功能关开测试暴露了它；不是把所有旧生命周期问题一并纳入的许可。
- **Resolution：** 建议按插件实例只注册一次，保留回调读取当前 GPT 激活状态，补重复关开回归；不重写整个模块生命周期。待 checkpoint 后明确修复范围。日志中的 Forced reflow 75ms/setTimeout 51ms 是性能警告，不据此认定它们造成 5 秒超时。
