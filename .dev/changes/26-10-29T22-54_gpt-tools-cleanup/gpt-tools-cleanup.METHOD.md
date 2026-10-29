# GPT 工具清理与思源原生工具接入：Method

本文件记录已采用的清理实现和仍待验证的 MCP 路线，不将源码调查升级为运行保证。目标见同目录 `gpt-tools-cleanup.TARGET-SPEC.md`。

## 基线与证据范围

2026-10-29，`feat/svg-text-assets` 的 `50faf3d` 已通过 `--no-ff` 合入 `main`，合并提交为 `32f7ad3`。本 change 从该提交切出的 `refactor/gpt-tools-cleanup` 开始。此前分支只改附件功能、版本和 changelog，没有改 GPT 代码。

合并前在 `50faf3d` 执行且主代理复核日志：

- `pnpm run test:gpt`：40 个聊天测试、42 个协议测试、5 个归档测试，全部通过。
- `pnpm run test:html-pages-webview`：10 个测试通过。
- `pnpm run build:publish`：通过。没有做本轮附件 UI 的思源内实测。

这些结果是清理前的源码基线；本次清理的回归结果见 PLAN。它们都不证明本机 MCP 联调成功。基线日志是本机 MSYS `/tmp/sy-f-misc-merge-{gpt,webview,build}.log`，不作为后续会话必须存在的输入。

全量 type-check 的基线有 5 个错误：`src/func/docfile-tools.ts` 四个 DOM 类型错误，`src/func/gpt/model/storage.ts:65` 一个 object/Record 类型错误。主代理用 `git archive` 将 `34c2ea1` 的源码提取到隔离的 `tmp/gpt-tools-baseline-34c2ea1/`，在不改共享工作树的情况下重新编译，复现了相同 5 个位置。不要在本 change 中顺带修复它们。

## 现有代码入口

| 路径 | 职责及本次阅读目的 |
|---|---|
| `src/func/gpt/tools/types.ts` | `Tool` 与 `ToolGroup`；检查远端定义能否直接映射，以及结果/取消接口需要哪些最小调整 |
| `src/func/gpt/tools/index.ts` | 同步工厂、组注册、全局组/工具默认值、审批适配器绑定 |
| `src/func/gpt/tools/executor.ts` | 组开关、规则索引、执行、格式化、截断和审批；不再保存变量或展开引用 |
| `src/func/gpt/tools/read-rule.ts` | 只读遍历已注册工具组的规则定义，完整返回文档 |
| `src/func/gpt/tools/toolchain.ts` | 多轮执行、原生消息、调用元数据；不生成 Legacy 伪日志 |
| `src/func/gpt/chat/ChatSession/use-openai-endpoints.ts` | 首轮请求与工具链衔接，所有新生成共用原生结果转换 |
| `src/func/gpt/chat/ChatSession/tool-chain-result.ts` | 原生消息转换为版本 payload 所需结果，末条 assistant 作为正文，其余作为工具消息序列 |
| `src/func/gpt/chat/ChatSession/message-lifecycle.ts` | 通过已创建的版本 ID 写入 stream/finalize，不写用户临时切换到的版本 |
| `src/func/gpt/chat/ChatSession/use-chat-session.ts` | 当前 worldLine/窗口/pin 上下文；Standard cell 展开 `toolChainMessages + message` |
| `src/func/gpt/chat/main.tsx` | 聊天与工具管理入口；变量管理菜单已移除 |
| `src/func/gpt/chat/components/SessionToolsManager.tsx` | 会话工具组 UI；当前 `groupRegistry` 本身不是响应式状态，异步新增组不能只修改普通对象 |
| `src/func/gpt/setting/ToolsManagerSetting.tsx` | 全局默认开关和权限；临时执行器也需要知道异步原生组，但不能在渲染中反复发现 |
| `src/func/gpt/model/config.ts`、`config_migration.ts`、`storage.ts` | 权限覆盖和配置 schema 3.4 迁移；删除旧 `toolCallMode`，不迁移会话历史 |
| `tests/gpt-tools.test.ts` | 真实执行器、规则、工具链与版本生命周期回归；仅模型/宿主边界替身 |
| `.dev/docs/tool-call/integration.md` | 新生成原生消息与旧 Legacy 记录的回放边界 |
| `.dev/docs/gpt-chat-history-persistence.md` | 修改旧历史兼容前必须遵守的持久化边界 |

## 已采用的清理实现

### 只读规则表，不建设新的记忆系统

沿用 `ToolGroup.declareSkillRules` 中仍有价值的正文与 `Rule/<group>/<topic>` 标识。`read-rule` 参数为 `name`，直接遍历已注册组查找，不另建一份规则/加载状态缓存。文档完整返回，不受普通工具的输出截断；未知规则返回 NOT_FOUND。

执行器注册这个内部辅助工具，仅当启用组中有启用工具且存在按需规则时将它加到模型定义。`alwaysLoad` 正文仍内联；组没有 `rulePrompt` 也能显示规则索引。读取已注册但关闭的组文档不被禁止，与用户保留的“开关只过滤定义”语义一致。

暂不增加规则安装器、自动激活状态、会话级“已加载”标志或独立 SKILL 仓库。`read-rule` 的结果是普通工具消息，和回答版本一起持久化；换分支后的可见内容由现有消息回放决定。

先分类再删内容：

| 原有内容 | 本轮处理 |
|---|---|
| `executor.ts` 的 VarRef、压缩日志说明及 `script-tools.ts` 的 VarRef 教程 | 随机制删除 |
| `file-system/skill-rules.ts` 的读取/写入模式、短参数说明 | 收到已有工具/参数描述中，删重复教程 |
| `web/index.ts` 的通用搜索与网页阅读流程 | 大幅精简，保留必要工具差异及用户回答偏好 |
| `siyuan/skill-doc.ts` 的表关系、路径/ID、日记、特殊语法 | 按非通用知识保留和合并，删除通用 SQL 教学 |
| `siyuan/diff-edit/diff-edit-skill.ts`、slice 语法 | 仍是自定义接口，保留必要说明；旧任务限制另行审阅 |

规则里的旧工具名和旧管理菜单要一并检查。不能只新增 `read-rule`，却留下提示模型去 `ReadVar` 或“变量管理”找数据。

### 变量与 Legacy 的删除连同消费者进行

已移除普通变量工具、`$VAR_REF` 展开、结果/参数缓存及缓存提示、变量管理页面和设置中的工具结果缓存入口。旧引用语法在工具参数中只是普通字符串。`injectVar` 的普通 JSON 值注入是脚本工具自身能力；去掉 VarRef 不等于删除普通参数注入。

`toolchain.ts` 继续产生原生 `IMessage[]` 和 UI 所需调用元数据，不再构建 Legacy 伪日志。新生成侧的 `toolChainContent` 和 `hintSize` 已删除；旧历史侧的 `userPromptSlice`、显示与上下文读取仍保留。`tool-chain-result.ts` 保留原有 Standard 分包语义，再交给现有 `message-lifecycle` 按预先创建的版本 ID 写入。

已在确认引用后删除未注册的 ToolCallScript、闲置执行器 VFS、无消费的 `declaredReturnType`、压缩回调和缓存开关，以及消费者/生产者中的对应字段。共享 VFS、脚本普通参数注入和权限提取不改。旧权限运行期兼容保留，避免顺带改变自定义工具的权限语义。

不保留 `ReadVar` 别名，不伪造旧缓存内容。配置 schema 3.4 一次性删除 `config.toolCallMode`，新生成统一原生消息；旧记录和历史文件不改。3–5 个编辑、复杂任务交给用户等旧策略仍保留，留待单独审阅。

在保留普通输出限制时，回归测试发现原逻辑用“加省略提示后的文本长度”判断截断，会将短输出的实际截断误报为未截断。本轮改为使用 `truncateContent().isTruncated`，没有改变截断长度或分页能力。

## MCP：独立调查与候选接入边界

### 前期已核对的上游事实

独立子代理完成只读调查后，主代理直接读取 Gitee 的 `v3.8.9` tag：`kernel/mcp/server.go` 和 `app/package.json` 与前期下载的 master 文件逐字节相同，后者 version 为 3.8.9。主代理另核对了该 tag 的 `kernel/model/mcp_oauth.go`、发布说明，并确认下面引用的 Agent API、契约和 skill 工具源码也与前期检查文件一致。以下结论锚定这一 tag，不代表 GitHub HEAD 或用户本机宿主版本。

- [v3.8.9 kernel/mcp/server.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/mcp/server.go)：`Serve` 注册 `/mcp`；`newHTTPHandler` 根据 `MCP-Protocol-Version >= 2026-07-28` 选择无状态新分支，否则选择有状态分支。两者均配置 `JSONResponse: true`。新分支还显式开启 `PropagateRequestCancellation`，不能把客户端 abort 等同于所有分支都已停止服务端操作。
- 同文件 `externalMCPToolAllowed` 排除 `AgentOnly`、来自其他 MCP 的工具，并服从工具暴露配置。不是原生 Agent 的所有能力都会对外可用。
- [kernel/api/agent.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/api/agent.go) 与 [kernel/apicontract/ai.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/apicontract/ai.go)：`lsCapabilities` 提供能力元信息，但不能假定它等同于完整 `tools/list` JSON Schema。
- [kernel/mcp/tools/skill.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/mcp/tools/skill.go)：用户/工作空间技能可加载正文与资源；官方内置插件开发技能有额外工作流授权。接入 MCP 不意味着获得这些授权。
- [kernel/apicontract/ai_agent.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/apicontract/ai_agent.go)：完整 Agent API 自带 session/revision/history，不采用它来替换本插件的聊天树。
- [v3.8.9 kernel/model/mcp_oauth.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/model/mcp_oauth.go)：`CheckMCPAuth` 保留 API token、工作空间会话及角色检查；源码存在同源已认证会话通路，但本机 Cookie 是否满足条件尚未验证。不能直接宣称所有插件无须认证即可调用。
- [v3.8.0 发布说明](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/app/changelogs/v3.8.0/v3.8.0.md) 和 [v3.8.7 发布说明](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/app/changelogs/v3.8.7/v3.8.7.md) 分别记载 MCP 引入及后续协议兼容变化。项目 `minAppVersion` 是 3.8.0，但这不足以证明所有这些版本均能使用同一客户端实现。

**独立调查结论与主代理判断：零新增依赖在技术上可行，当前推荐保留这条候选路线；没有本机联调证据。** JSON 响应使 SSE 通知订阅不必成为本次义务，但不消除初始化、版本、session header 和错误处理。没有依据承诺固定实现行数或跨所有思源版本兼容。

### 工具数量、官方开关与插件选择（v3.8.9）

用户新增调研要求：工具是否过多、官方开关控制哪一层，以及插件应全量提供还是增加自己的选择。以下由独立子代理调查，主代理回读固定 tag 的 UI、配置、投影和上游测试核对；没有读取本机配置或执行真实工具。

**事实：官方存在三种不同控制，不能互相替代。**

| 控制 | 配置 | 作用 |
|---|---|---|
| 内置 Agent 可用能力 | `ai.agent.capabilityPolicy` | 给内置 Agent 使用的能力集，包含前端和后端能力 |
| 对外 MCP 暴露 | `ai.mcp.exposurePolicy` | 决定本机 `/mcp` 暴露哪些后端能力，不跟随 Agent 的开关 |
| 连接外部 MCP 服务 | `ai.mcp.servers[].enabled` | 思源作为客户端引入远端工具；这些远端工具不会再由本机 `/mcp` 转发 |

[aiCapabilityUi.ts](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/app/src/config/tabs/ai/aiCapabilityUi.ts) 的能力弹窗含 `agent` / `mcp` 两个 scope，分别保存 `agent.capabilityPolicy` 和 `mcp.exposurePolicy`。工具可逐个或按显示组批量切换；组按钮实际写入每个能力 ID 的 override，不保存独立组策略。action 的审批下拉框仅在 Agent scope 显示，不是 MCP 的动作级暴露开关。

[kernel/conf/ai.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/conf/ai.go) 的 `CapabilityPolicy` 是 `default: allow|deny + overrides[id]`，默认 allow；配置模型可表达默认拒绝加逐项允许，但上述 UI 只调整 overrides，不能据此宣称 UI 有白名单模式按钮。ID 是整个工具的稳定能力 ID，例如 `native/backend/block`，不包含 action。

**事实：MCP 清单已按官方策略过滤，但不会裁剪工具内部动作。** `server.go` 原样投影 `InputSchema`，只对整个工具做允许/排除。例如 [block.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/mcp/tools/block.go) 是一个 `block` 工具、14 个 action；[file.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/mcp/tools/file.go) 是一个 `file` 工具、10 个 action，读写混合。不能把“工具名称个数”“动作个数”“原生 Agent 面板能力总数”当成同一数量。实际本机工具总数及完整定义体积仍未测量。

[setting.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/api/setting.go) 保存 AI 配置后调用 `RefreshToolExposure()`；投影更新 `AddTool/RemoveTools`。后续 `tools/list` 可见新集合，`tools/call` 还会重新检查策略，不能靠旧清单调用已被官方禁用的能力。[server_test.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/mcp/server_test.go) 的 `TestToolProjectionPolicyAndExecutionRecheck` 覆盖同连接下列表更新及禁用后 handler 不执行；本轮只读了这个测试，未运行上游 Go 测试。具体通知投递链路没有实测，不承诺客户端实时同步。

`lsCapabilities` 返回能力/动作元信息，不返回某使用方的启用策略；完整 Schema 仍从 `tools/list` 获取。官方 UI 读取 `window.siyuan.config.ai.mcp.exposurePolicy` 子字段，插件可在合适宿主上下文参考此元信息，但不能将其当成可执行工具清单，也不需要读取含凭证的整个配置文件。

**候选建议，尚未选定默认与粒度：** 将 MCP 发现和发给模型的定义分开。官方暴露是全局服务端边界；插件现有 `groupDefaults/toolDefaults` 与会话工具选择负责聊天上下文。可以发现官方允许的全部工具，再复用现有组/工具开关选择模型可见子集，无需第三套权限平台或写回官方全局配置。

原生组默认关闭、启用组后默认选哪些工具、新发现工具是否自动选中，以及是否提供 action 级模型定义筛选，都仍待实际清单与体积数据后决定。若只按工具选择，选中 `block` 就会同时给模型读写动作，不能称为只读模式。动作拆分还需正确处理共享参数和长描述，不能仅裁剪 enum 就宣称完成适配。

接线时核对 `ToolsManagerSetting.tsx` / `SessionToolsManager.tsx` 的异步列表和默认值一致性；全局组 checkbox 当前显示默认 false，而 toggle 使用 `!== false` 取默认值，初始未配置时两者不一致。应在原生组实现中补相应行为验证，不在这轮只读研究中修改控件。

官方服务端禁用会阻止实际调用；本插件自己的开关仍只筛选模型定义，不改变用户指定的按名执行语义。官方 Agent 也会执行前复查能力，不能把它描述成与本插件的开关语义完全相同。

### 当前候选：思源专用桥接，而非通用客户端

通过原生 `fetch` 调用本机 `/mcp`，只承担已验证的思源版本/协议范围。候选首先验证有状态分支：`initialize`、服务端协商版本与响应 session header、`notifications/initialized`、`tools/list` 的 `nextCursor` 分页、`tools/call`。请求 Accept/Content-Type、协商后的协议 header、session 生命周期和空通知响应必须实测；不把“省略某个 header 就能选旧分支”当成已确认的兼容合同。

无状态新分支具有不同的发现和请求元信息规则，是否反而更适合本机版本由探针决定，暂不同时维护两套完整客户端。不能因为“不用 SDK”而忽略协议，也不能因此顺手承担任意 MCP server、OAuth、stdio、订阅或重连平台。首版无需为 JSON 响应服务建设长期 GET SSE 连接；遇到支持范围外响应，应明确报错而不是临时加入通用传输回退。

候选映射为：

```text
思源 tools/list → 原生工具组的 Tool.definition
Tool.execute(args) → 思源 tools/call → ToolExecuteResult
现有 ToolExecutor / toolchain / message-lifecycle → 现有回答版本
```

工具名称映射、输入 schema、MCP 错误与结果块转换集中在桥接层。若原生 schema 超出现有类型或各 Provider 适配能力，先验证真实兼容面，不只用类型断言掩盖差异。调用结果的 `isError`、文本 content 和 structuredContent 分别保留语义，不能仅按优先级选一个字段而丢失其他内容。

同名工具当前会覆盖，桥接应采用稳定名字映射或显式拒绝冲突。若采用前缀，原生 SKILL 中提及的原始工具名也需有可理解的映射；不能仅重命名 schema 就声称技能兼容。

异步注册要同时解决全局设置面板和会话面板的可见性，以及注册后的组/工具默认值应用。尽量不在每轮模型请求里重扫工具。不先承诺热更新、后台轮询、多服务配置或跨会话共享连接。

MCP 工具仍通过插件的审批回调运行；服务端访问控制与 AgentOnly/工具自身约束继续有效。`server.go` 投影了 `readOnlyHint`，但未将全部动作级副作用元信息投影为 MCP annotations。`lsCapabilities` 可提供额外元信息，却是另一条具有自身访问条件的 API；不要假定只读提示等于可信授权或给所有调用默认自动批准。默认权限和首版工具范围必须在开放前决定。

首版可考虑文本和结构化结果，但尚未确认用户需要的工具集合。图片、资源、复合结果、`skill` 的安装/删除动作不能在未决定范围时被默认为完整支持。

### 运行验证门槛

在实现桥接前，用用户明确选定的思源实例验证：初始化、工具发现和一个可控的只读调用。不得为了拿 token 而读取用户配置或打印凭证，不执行真实写工具。

2026-10-30 的实际环境检查：现有 `siyuan-cli v0.17.0` 将本项目解析为 `dev`（来源 project-file）。请求只读元信息 `system.version` 返回 `WORKSPACE_VERIFY_FAILED`，提示配置端口 3422 与目标工作区运行时校验不匹配。没有绕过校验、切换工作区、直接读取/输出凭证或访问笔记，也没有向 `/mcp` 发请求。需要用户确认/启动目标实例后再测；这个阻碍不证明 MCP 路线不可行。当前仍没有真实工具总数、完整定义体积或同源握手证据。

需要观察请求/响应状态、协商版本、认证要求、session header、JSON/SSE 形态和工具结果结构，并验证所需规则没有演变成半套通用 SDK。旧 Go SDK 分支的握手及 session 行为，本轮没有取到依赖源码验证，尤其不能仅依报告假设响应一定包含 session header。

401/403、会话失效与 HTTP 错误要有可见结果，但不直接采用“400/404 就重建并重试”的做法：`tools/call` 失败时可能已有副作用。写调用或结果未知的调用不自动重发。客户端 fetch 取消与服务端实际停止分别验证，不承诺撤销已经发生的写入。

如果必须新增依赖、大幅提高宿主版本下限或建设复杂传输兼容，回到用户决定，不直接扩大实现。

## 审查发现但尚未纳入实施的相邻问题

早期会话中对真实执行器使用假工具/假网络做过隔离复现：`on-error` 结果审批未触发、被拒结果仍可由变量读取、预先 aborted 的链仍执行工具、`ok:false` 模型结果可被标为完成；块编辑同 block ID 的两项编辑可能只保留后一项。这些复现未被提交为自动化测试。

源码还显示工具链后续请求绕过首轮隐私处理，且 aborted/error 收尾退回 initialResponse，可能丢已完成调用记录。删除变量会自然消除缓存泄露路径，但不等于其他问题均已解决。若本次变更依赖这些行为，先在 PLAN 明确纳入范围并验证；否则单列后续工作，不在清理名义下重做全部 Agent。
