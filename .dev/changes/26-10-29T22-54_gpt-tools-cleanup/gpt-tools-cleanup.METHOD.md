# GPT 工具清理与思源原生工具接入：Method

目标在同目录 `gpt-tools-cleanup.TARGET-SPEC.md`，进度、依赖与回归在 PLAN。本文件只保留仍影响接入决策的实现依据；临时地址和脚本位置见最新 handover。

## 已落地的清理基线

清理源码为 `b4a05f9`，不是待重新设计的候选方案。永久维护说明在 `.dev/docs/tool-call/index.md`、`rules.md`、`integration.md`。

- `read-rule` 直接遍历 `ToolGroup.declareSkillRules`，沿用 `Rule/<group>/<topic>`。没有变量或加载状态副本，不保留 `ReadVar` 别名。
- 执行器在启用工具组存在启用工具和按需规则时提供 reader；pinned 正文内联，无 group rulePrompt 也不丢索引。文档完整返回，不受普通输出截断。
- 新生成使用原生消息。`tool-chain-result.ts` 把末条 assistant 作为正文，其余序列保存在版本 payload；`message-lifecycle.ts` 写启动时创建的版本。
- 配置 schema 3.4 清掉 `toolCallMode`；旧历史的 `userPromptSlice` 及读取/显示/导出保留，不批量迁移历史。
- 普通 JSON 参数注入、分页、长度限制、共享 VFS 和原有权限能力保留；无消费者的工具脚本、元数据及生成链已清理。
- 截断标志改用 `truncateContent().isTruncated`，避免省略提示变长后误报未截断；有回归保护。

## MCP 已验证的有限路线

### 运行证据

2026-10-30，用户启动并指定的 dev 为思源 **3.8.8**。CLI 实例校验通过后，Node 原生 `fetch` 无 SDK 完成：

```text
initialize(protocolVersion=2025-03-26) → HTTP 200、JSON、Mcp-Session-Id
notifications/initialized            → HTTP 202、空响应
tools/list                          → HTTP 200、单页 30 工具
tools/call(system, action=version)    → 正常文本结果 3.8.8
DELETE /mcp                         → HTTP 204，关闭本次协议 session
```

Accept 同时声明 JSON/SSE，后续请求携带协商版本和 session header。各探针 session 已关闭；只调用了版本工具和能力元信息，没有访问笔记、运行写工具、改动权限配置或直接读取/输出 token。

该 dev 的直接请求不带凭证也成功，不能推广为所有安装无需认证。**该次探针只证明有限有状态 HTTP 通信可行，不证明完整插件 UI、Provider 或整个工具组已接入。** 本轮新增的生产代码与验证边界见下一节。

### 本轮 renderer 与生产代码证据（2026-10-31）

先重新运行 CLI current/verify/version，确认项目仍指向 dev，端口 4143、版本 3.8.8。使用隔离 Edge、临时 profile，在真实 `/stage/build/desktop/` 浏览器前端通过相对 `/mcp` 和 `credentials: same-origin` 完成握手、30 工具发现、system.version 和 DELETE；未读取 token、笔记或用户浏览器 profile。

随后将生产 `client.ts`、桥接 `index.ts` 与真实 ToolExecutor 编译到该前端，再跑同一最小通路：30 工具均可表示，skippedTools 为空；组关闭及仅开启组时模型定义均为 0，只勾选 system 后为 sy_mcp_system；执行前审批回调恰好 1 次，正常返回版本 3.8.8，最后关闭该次 session。模型端点/插件 UI 等无关边界使用测试 fixture，没有真实 Provider 请求。

该隔离浏览器中 `window.siyuan` 存在，但插件主界面未加载（fmisc/GPT 均未加载）。因此这些是生产接入组件在宿主同源环境中的证据，**不是候选插件完整 UI、Electron 独立窗口或带认证实例的验收**。临时脚本/快照在忽略的 tmp 中，不属于产品依赖；会话和自建浏览器均已关闭。

### 实际工具规模与元信息

`lsCapabilities` 返回 35 个后端能力；MCP 返回 30 个，其余 decision/log/question/snippet/todo_write 均为 AgentOnly。30 工具有 168 个明确枚举的 action，另有 unzip/web_fetch/web_search 三个工具没有 action 枚举。

| 测量对象 | 紧凑 JSON 的 UTF-8 字节数 |
|---|---:|
| MCP 工具目录 | 64,286 |
| 映射为当前 OpenAI function 定义（name/description/inputSchema） | 64,630 |
| 示例：system/search/sql/document/block 五工具 | 19,264 |
| 示例：system/search/sql/outline/ref 五工具 | 5,053 |

这是字节数，不是 tokenizer 计数或已计费 token。示例子集不是已批准默认值或只读沙盒，例如 search 也含写动作。

映射后的前五大定义为 database 11,103、block 10,094、bazaar 5,216、document 5,088、template 4,972 字节，合计约 56%。少数工具的长描述/Schema 占大头，只统计名称数不足以决定注入范围。

当前输入根关键字只有 type/properties/required，递归未发现 oneOf/anyOf/allOf/$ref/$defs/const；不能据此保证未来动态工具同样简单。30 个工具均未给出明确 readOnlyHint；168 个枚举动作中 98 个 effects 为空。空值不是只读证明，不能用它自动批准。

## 官方开关的实际作用

固定版本来源为 v3.8.9；另比较了 v3.8.8 的 server.go、conf/ai.go、aiCapabilityUi.ts，下面的控制语义一致。没有在用户实例中改动暴露设置。

| 控制 | 配置 | 作用 |
|---|---|---|
| 内置 Agent 能力 | `ai.agent.capabilityPolicy` | 控制 Agent，可含前端及后端能力 |
| 对外 MCP 暴露 | `ai.mcp.exposurePolicy` | 控制本机 `/mcp` 的后端工具集合，不跟随 Agent 开关 |
| 连接远端 MCP | `ai.mcp.servers[].enabled` | 思源作为客户端引入远端工具，不再由本机 `/mcp` 转发 |

[aiCapabilityUi.ts](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/app/src/config/tabs/ai/aiCapabilityUi.ts) 的能力弹窗有 agent/mcp 两个 scope。可逐工具或按显示组批量切换；组操作写入每个能力 ID 的 override，不保存独立组策略。动作级下拉框只在 Agent scope 显示，是审批而非 MCP 暴露筛选。

[conf/ai.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/conf/ai.go) 的策略为 `default: allow|deny + overrides[id]`，默认 allow。配置模型可表达默认拒绝加逐项允许，但 UI 只调整 overrides，不能据此宣称 UI 有白名单模式按钮。能力 ID 对应整个工具，如 `native/backend/block`，不含 action。

[server.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/mcp/server.go) 排除 AgentOnly、Source/Runtime 为 mcp 的工具；InputSchema 原样投影，不裁剪动作。`block` 是 1 工具/14 动作，`file` 是 1 工具/10 动作，都混合读写。

[setting.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/api/setting.go) 保存后调用 `RefreshToolExposure()` 更新 AddTool/RemoveTools；执行前仍复查策略，不能靠旧清单调用被官方禁用的工具。[server_test.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/mcp/server_test.go) 的 `TestToolProjectionPolicyAndExecutionRecheck` 覆盖此语义；本轮只读该测试，没有运行上游 Go 测试或实测暴露切换/通知投递。

`lsCapabilities` 提供来源、动作和效果，不含使用方策略或完整输入 Schema。官方 UI 读 `window.siyuan.config.ai.mcp.exposurePolicy` 子字段；不需要读取整个配置文件，也不能用此字段替代 `tools/list`。

官方服务端禁用会拦实际调用；本插件的开关只筛选模型定义，两者不同。官方 Agent 也有执行前复查，不要将其描述成与本插件语义相同。

## 已接受的接入边界

用户在消费 R1 handover 后确认：独立原生 MCP 组，组默认关闭，按整工具选择；首次打开与后续新增工具均默认不选。默认权限为 `executionPolicy: ask-always`、`resultApprovalPolicy: never`（成功结果直接发送），保留现有单工具权限覆盖。这些是产品合同，不再重复询问初始全选/不选或默认审批。

用户指出可在 GPT/插件启动时加载工具目录，无需因异步发现建设运行时刷新，并在审阅 SHAPE 与评审处置后授权开始。`gpt-tools-cleanup.SHAPE.md` 保留接受时的文件/职责预测及实施对照；本文件不重复实现形态。独立架构评审和实现后代码复核的处置在 `gpt-tools-cleanup.ARCH-REVIEW.md`。产品源码已接入，自动与宿主验证状态见 PLAN；不能把实施后组件探针当作完整插件验收。

实现复用现有组/单工具开关及审批，不另造第三套权限平台，不主动写回官方全局策略。用户要求后续实质行为/架构变化继续先讨论；不因本轮授权或开发直连许可推断模型可自动批准所有工具。首版范围已经收口到 SPEC/SHAPE，不重开已决定的默认值问题。

### 有限桥接形态

```text
本机 tools/list → ToolGroup / Tool.definition
Tool.execute(args) → tools/call → ToolExecuteResult
现有 executor / toolchain / lifecycle → 原有回答版本
```

首版采用已验证的 2025-03-26 有状态分支；不同时维护 2026-07-28 无状态协议、任意服务、stdio、OAuth 或长期 SSE 订阅。JSONResponse 不等于可以省略初始化、分页、session 和错误处理。官方 MCP 的引入及协议演进分别见 [v3.8.0](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/app/changelogs/v3.8.0/v3.8.0.md) / [v3.8.7](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/app/changelogs/v3.8.7/v3.8.7.md) 发布说明；项目 minAppVersion=3.8.0 不代表全版本已验证。

输入 Schema、名称映射、MCP `isError`、text content 与 structuredContent 的转换应集中在桥接层。不要只靠类型断言，或选一个结果字段就丢掉其他内容。图片/资源等未支持内容须明确失败，不能伪报整个调用无副作用。

现注册器同名会覆盖；原生组用稳定前缀并在工厂检测冲突，只跳过原生组而不改全局覆盖语义。组提示说明 SKILL 中原名的对应关系，但不据此声称完整技能兼容。[skill.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/mcp/tools/skill.go) 的官方插件开发技能另有工作流授权；完整 [Agent API](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/apicontract/ai_agent.go) 自带 session/revision，不用于替换聊天树。

### 实施前需读的耦合点

| 工作区路径 | 原因 |
|---|---|
| `src/func/gpt/tools/types.ts`、`index.ts`、`executor.ts` | 同步组注册、默认值、审批与定义筛选；MCP 发现是异步 |
| `src/func/gpt/setting/ToolsManagerSetting.tsx` | 临时 executor 在启动状态确定后创建；有效值统一为已保存覆盖或 executor 默认值，不再保留未配置时显示/切换不一致 |
| `src/func/gpt/chat/components/SessionToolsManager.tsx` | 普通 groupRegistry 按组件构造时的快照枚举；本轮不异步补注册，也不为此改造响应式列表 |
| `src/func/gpt/chat/ChatSession/tool-chain-result.ts`、`message-lifecycle.ts`、`use-chat-session.ts` | 结果转换、目标版本绑定和选中路径回放，不能被来源适配破坏 |
| `src/func/gpt/openai/claude-complete.ts`、`gemini-complete.ts` | 当前工具 Schema 转换会重建 properties/required 等字段，需核对实际支持范围 |
| `.dev/docs/gpt-chat-history-persistence.md` | 任何历史/归档改动前的合同；MCP 不应要求存储重构 |

定义快照与结果记忆不是同一机制。同一次 GPT 激活内只共享连接和定义，不共享聊天/审批；不实现轮询、热更新或额外持久状态。HTTP/JSON-RPC/session 错误要可见，不按 400/404 无条件重试；结果未知的写调用不自动重发。fetch abort 不等于服务端已停止或撤销写入。

[server.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/mcp/server.go) 的有状态/无状态分支都配置 JSONResponse，新分支另开启 PropagateRequestCancellation；[mcp_oauth.go](https://gitee.com/siyuan-note/siyuan/blob/v3.8.9/kernel/model/mcp_oauth.go) 保留会话、API token 和角色检查。宿主浏览器同源通路及本轮生产组件已验证；完整插件生命周期/UI、Provider 实际请求、暴露通知、复杂真实结果及带认证实例仍需新证据，不能扩大本轮成功结论。

## 相邻审查发现：不自动纳入实施

已有隔离复现/源码证据，但不属于本次自动修复授权：错误结果提前返回导致 on-error 审批不触发；跨轮请求绕过首轮隐私屏蔽；中断与审批取消不贯通；error/aborted 收尾退回 initialResponse 丢记录；部分成功细节丢失；同块重复编辑覆盖；跨协议续传数据丢失。

删除变量已消除一个拒发结果的缓存取回入口，不等于修复上述问题。若所选 MCP 合同确实依赖某项修复，单独建立问题、限定范围并补测试，不恢复早期全量 Agent 重构。
