---
status: completed
---

# 原生 MCP 接入提案：GPT 启动快照

本文件预测接入后的代码分布、职责和可见行为。用户审阅提案及首轮评审处置后回复“方案大致 Ok，请开始”，授权按本形态实施；accepted 不代表代码完成或宿主验收通过。目标合同见同目录 `gpt-tools-cleanup.TARGET-SPEC.md`，通信证据见 `gpt-tools-cleanup.METHOD.md`，进度见 `gpt-tools-cleanup.PLAN.md`。源码基线为 `b4a05f9`；当前分支后续提交及本轮改动均为文档。

## 1. 已确认与本次提议

用户已确认：独立原生 MCP 组默认关闭；按整工具选择，首次及新增工具默认不选；默认执行前每次确认，成功结果直接发送，保留现有单工具权限覆盖。chat-first、聊天树/回答版本、零新增依赖、开关只筛模型定义的合同不变。

用户指出可以在 GPT/插件启动时发现工具，不必因发现异步而建设运行时刷新机制。本提案采用 **GPT 功能启动时完成一次发现，随后各执行器读取本次启动的内存快照**。该结构及下述首版边界已随本轮实施授权接受。

不是通用 MCP 客户端：仅请求当前思源界面的同源 `/mcp`，不提供地址/token 设置，不连接远端服务，不启动进程，不导入思源 Agent 会话。

## 2. 用一次实际操作解释结果

1. 开启 GPT 功能：插件执行 initialize → initialized → tools/list，将定义保存在内存；不调用笔记/文件工具，不把清单写进聊天，也不把全部清单发给模型。
2. 打开全局工具设置：显示原生组与发现的工具。组与单工具初始都不勾选。保存的默认选择在新建聊天标签页/窗口、构造新的 ChatSession 组件时应用，不反向修改已打开组件。现有标签内的“新建对话”按钮只清空会话数据，保留 executor 和工具选择；本提案不改变它。
3. 打开聊天 A，只启用原生组中的 `system`；聊天 B 不启用。A 的模型请求含 `sy_mcp_system`，B 不含。两者共用协议 session 和定义，不共用勾选、审批记录、消息或回答版本。
4. A 的模型请求 `sy_mcp_system({"action":"version"})`：现有 executor 先审批，批准后桥接为 `tools/call(name="system", arguments=原参数)`；结果转换后仍进入现有 toolchain、结果转换和 message lifecycle。
5. 查看旧回答或切换分支不执行 MCP。重新生成是新请求，仍按既有启动版本绑定规则处理。
6. 同一次 GPT 启动不重新发现工具。思源升级后重启会取得新快照；官方暴露策略运行中变化时，旧清单可能仍显示，但官方会在执行时复查。需要更新清单时重载 GPT/插件，不添加刷新按钮、轮询、目录订阅或生成前发现。

命名前缀提议为 `sy_mcp_`，例如 `system → sy_mcp_system`。面板通过描述说明原名；原生组短提示说明技能文本中的原名如何对应插件名称。只在 MCP 接入处转换名称，不修改历史或原生文档正文。

## 3. 启动、关闭与失败由谁负责

### GPT 生命周期

`src/func/gpt/index.ts` 持有本次 GPT 启动的 AbortController 和初始化 Promise。`load()` 发起一次 MCP 初始化，等它成功或明确不可用后继续注册功能入口。它不把 MCP 加入 settings apply 或自定义扩展同步锁。

**注册顺序本身不足以保证就绪。** 现有 unload 不移除全部菜单/Tab/Dock；旧入口可在再次启动期间被调用。因此 index.ts 内增加一个统一的 `renderReadyChatSession(container, props)`：Tab、独立窗口 Tab、Dock 三处真正构造 ChatSession 的位置均使用它。它只等待本次启动已有的 Promise，不发起发现；若容器已销毁、GPT 已关闭或该次启动已取消，不再延迟挂载组件。它返回 disposer，继续由现有 beforeDestroy/destroy 持有。组件一旦创建，不因后续状态变化自动卸载、重建或换绑 executor。

`startupExtensions.load()` 的异步完成回调也捕获本次生命周期 signal，已取消的旧回调不能因新一轮 enabled=true 而添加 Dock。这样由 GPT 入口统一保证构造前提，而不要求菜单调用者、useSession 或模型请求自行补发现逻辑。保留原有菜单/Tab/Dock 注册方式，不顺带重写其全局清理机制。

提议启动阶段有 **5 秒总等待上限**，覆盖握手和目录分页；该可见行为已随本轮提案实施授权接受。成功发布完整快照；超时、无端点、认证失败或不支持的协议发布 unavailable，之后继续原有 GPT 启动，不向模块框架抛出 MCP 故障。GPT 就绪及插件 onload 完成可能多等待这段准备时间；其他功能模块仍按原有框架并行启动，MCP 失败不会永久禁用普通聊天。

初始化接收 GPT 本次启动的生命周期 AbortSignal；`unload()` 先取消它，再释放 MCP 资源。旧初始化被取消后不得继续注册 GPT 入口或发布旧快照。关闭已知的本次 MCP session 属于有界、尽力清理，不延长上述就绪等待，也不承诺撤销服务端操作。不为此重构整个插件生命周期。

### MCP 模块

同一 GPT 模块实例持有一份 client、一份定义快照和启动状态。独立思源窗口有各自的模块实例，不共享跨窗口连接。

- 状态仅为 `off / loading / ready / unavailable`，通过 `solid-signal-ref` 提供给设置 UI。
- 握手、分页和 JSON-RPC 错误处理归 client；工具定义、名称和结果转换归桥接入口。
- 不保留笔记结果缓存，不把审批记录放进共享 client。
- Tool.execute 闭包绑定创建它的 client。GPT 关闭后旧组件的原生工具明确返回“本次原生连接已关闭”，不自动挂到下一次启动的连接。**必须关闭后重新打开聊天标签页/窗口，才会创建使用新快照的 executor；旧标签内点“新建对话”不会恢复连接。** 这是本轮接受的首版限制，不修改旧组件的工具选择或偷偷换绑。
- HTTP/session 失效只报告当前调用错误。不自动重新初始化，不重发结果未知的调用。取消 HTTP 请求不宣称撤销服务端写入。

### 设置面板的启动边界

GPT 关闭时设置面板仍可打开，这是现有代码的行为。面板不能自行初始化 MCP：off 时照常显示本地工具，并说明“启用 GPT 后发现原生工具”。

若设置面板恰好在初始化期间打开，只对工具管理内容显示短暂加载状态；ready/unavailable 后再创建临时 executor。避免临时 executor 过早创建后永远缺少原生组。若 GPT 由 off 开始启动，原生状态的变化也会使该临时展示重新建立；全局选择已存在配置 store，不会因此丢失。

ChatSession 的构造就绪由上述 index.ts 统一渲染入口保障；设置面板只管理自己的临时 executor。两者均等待同一次启动任务，不各自定义发现流程。`chat/main.tsx` 的“新建对话”及 `use-chat-session.ts:newSession()` 保持复用 executor，不把异步协调分散到 buildChatOption 或工具循环。

## 4. 预计 diff

下列量级包含常规错误处理，不是承诺行数。`modify` 的文件原则上保留原有流程，只改标明的职责；没有删除文件。

```text
src/func/gpt/
├── tools/native-mcp/
│   ├── client.ts                     create  +180–260
│   │   原生 fetch、固定协议分支、session/request ID、握手、分页、调用及关闭。
│   └── index.ts                      create  +150–230
│       本次启动的快照/状态；输入校验、前缀、ToolGroup 与结果转换。
├── index.ts                          modify  +65–100/-8–18
│   一次启动任务与取消；统一三处 ChatSession 的就绪渲染/晚到销毁，约束旧扩展
│   完成回调。保留扩展加载、菜单及缓存业务，不重构整个 GPT 生命周期。
├── tools/types.ts                    modify  +3–6
│   ToolGroup 增加可选 defaultToolEnabled，缺省 true，表达组内工具的初始默认值。
├── tools/executor.ts                 modify  +3–8/-0–3
│   registerToolGroup 按该默认值初始化单工具；注册/选择/审批/执行语义不变。
├── tools/index.ts                    modify  +8–18
│   从快照注册原生组，然后照旧应用 groupDefaults、toolDefaults 和审批回调。
├── setting/ToolsManagerSetting.tsx   modify  +25–45/-8–15
│   一次启动就绪边界及失败提示；默认值读取与 executor 一致，修正未配置时
│   “显示关闭、第一次点击却仍关闭”的相邻读取不一致。保留现有权限管理页面。
├── setting/tool-permission-manager.html  modify  +8–16/-2–6
│   修改一类审批时，从真实工具读取另一类的有效默认值，不用仅有 name 的假对象。
├── tools/manual-execute.ts           no change
│   首版不纳入原生 MCP；保留现有 Tool Hub/选择器及其手动免审批语义。
├── chat/{main.tsx,ChatSession/use-chat-session.ts}  no change
│   明确保留“新建对话”复用 executor 的语义；不是隐藏遗漏的重置/热更新路径。
└── openai/{claude,gemini}-complete.ts no change
    首版仅接入当前可无损表示的输入 schema，不借 MCP 改造 Provider 转换器。

tests/
├── gpt-native-mcp.test.ts            create  +220–330
│   有状态 fetch 假宿主 + 真桥接/执行器；目录、审批、结果、生命周期及两执行器隔离。
├── gpt-tools.test.ts                 modify  +20–45
│   注册默认值与现有按名调用合同；复用现有工具链/版本归属回归。
├── gpt-tool-permissions.test.ts      create  +40–65
│   执行真实权限页面脚本的数据逻辑：仅改结果审批不能把 ask-always 变为 auto。
└── run-gpt-tools-tests.mjs           modify  +3–8
    将新增测试纳入现有 esbuild + node:test 流程，不增加依赖或另建测试框架。

.dev/docs/tool-call/{index,executor,integration}.md  modify  合计 +25–50/-0–10
    实施后记录实际入口和维护约束，不先把本提案写成既定事实。
.dev/changes/26-10-29T22-54_gpt-tools-cleanup/         modify/create 文档更新
    SHAPE 拥有空间预测；SPEC 保存确认目标；METHOD 只链接实现形态；PLAN 保存门槛。
```

预计生产代码净增约 450–700 行，测试约 280–450 行。评审使启动入口改动从约 25–45 行扩大到 65–100 行，并纳入一个直接影响已接受权限合同的 HTML 修复；不以“局部细节”为名藏掉这些变化。若实现需要重写 executor、改聊天持久化，或显著修改多个 Provider，已超出本预测，应停止并说明原因。

明确不改：聊天树、世界线/版本、toolchain 调度、tool-chain-result、message-lifecycle、配置 schema/version、package/plugin 版本、依赖清单。现有 groupDefaults/toolDefaults/permissionOverrides 的按名称字典可直接保存新组与新工具，不做迁移。

## 5. 最小跨文件接口与默认值

拟议 MCP 入口只向现有代码提供四项能力，名称可在实施中局部调整，职责不可拆散到调用者：

```typescript
initializeNativeMcp(signal: AbortSignal): Promise<void>; // 一次启动，失败转 unavailable
nativeMcpState(): Readonly<StartupState>;               // 响应式状态，不暴露 session ID
getNativeMcpGroup(): ToolGroup | undefined;              // 同步读取 ready 快照，不触发网络
closeNativeMcp(): Promise<void>;                         // 取消请求、关闭 session、释放快照
```

`ToolGroup.defaultToolEnabled?: boolean` 的缺省为 true，保持全部现有组的行为；原生组声明 false。它只定义注册时的初始值，不成为第三套权限或启用策略。executor 初始化后仍按原顺序应用用户全局覆盖，当前聊天的操作仍只改自己的 enablingStore。

全局面板的有效值使用 `已保存覆盖 ?? 临时 executor 默认值`，切换操作也读取同一有效值。不能在面板再写一份“原生前缀默认 false”的判断。

权限覆盖仍由现有机制执行，但须修复一个直接相交的旧缺陷：`tool-permission-manager.html:updateResultApprovalPolicy()` 用 `{ name }` 查询未修改的执行策略，缺失工具默认值会退回 auto。两类单项修改均改为从页面已有的真实工具对象计算另一类有效策略，继续保存原有完整覆盖格式；不引入新的覆盖模型或权限库。其最小回归是：原生工具默认 ask-always/never，只把结果改为 always，保存后仍为 ask-always/always。

调用方向保持：`GPT 生命周期 → MCP 入口 → client`，`工具工厂 → MCP 入口 → ToolGroup`，`现有 executor → Tool.execute → client`。MCP 不反向 import chat、TreeModel、Provider 或审批 UI。

同一目录定义可复用，但 ToolGroup 包装不携带聊天状态。原生名称不得直接注册为 `system/search/...`；原生组接入前检查前缀名称是否与现有工具冲突，冲突时只跳过原生组并给出可见诊断，不让现注册器覆盖本地工具，也不改变其他组原有的同名覆盖合同。

## 6. 输入、结果与手动执行的首版边界

### 输入定义

桥接校验 JSON 输入，而不是把 inputSchema 断言成 IToolDefinition。首版支持已实测的根 object/properties/required 结构及当前 Provider 可透传的属性子树。出现根级组合、引用或其他无法无损传递的关键字时，该工具不注册并显示原因；不删除关键字后照常宣称支持，也不建设完整 JSON Schema 转译器。

Claude/Gemini 目前会重建根 schema，因此包含 additionalProperties 等新根关键字的工具不能因为 OpenAI 可用就全局标为可用。若实测当前目录超出共同子集，先回报影响再决定是否扩大 Provider 改动范围。

### 返回内容

文本与 structuredContent 都保留：前者按文本，后者作为 JSON 文本；两者并存时分段显示。成功结果继续使用现有格式化、长度限制及可选结果审批，不增加结果仓库。

MCP isError、HTTP/JSON-RPC 错误和未支持内容不能变成 SUCCESS。对于图片/音频/资源等未支持内容，返回明确 ERROR，包含可用文本/结构化信息及“返回内容不完整，操作可能已执行”的说明，不只返回一个无上下文的“执行失败”。当前 executor 会用 error 生成失败 finalText，因此这份完整诊断须由桥接放入 error，不能只放 data 或自写 finalText 后被覆盖。空 content 但有 structuredContent 不是错误；两者皆空允许作为无正文成功结果。

不在本轮修复旧 on-error 审批不触发、聊天停止未贯通工具取消等问题；不能宣称 MCP 具备这些尚不存在的能力。若上述接口被证明无法满足已接受的 MCP 合同，单列范围再讨论。

### 原生 skill

不按代理猜测的“危险程度”另设隐藏工具白名单；官方允许且 schema 可表示的工具均可供用户勾选，包括 skill。skill 的管理动作仍受整工具选择及现有执行审批控制。没有自动技能发现/激活、提示词注入、名称正文重写或原生 Agent 工作流授权；某些技能要求的原生工作流可能因此不成立，界面/描述不声称完整兼容。

### Tool Hub 与选择器

首版建议 **不接入原生 MCP**。现有 Tool Hub 另建 executor，executeTool 明确跳过两类审批；不因希望“清单处处相同”而顺带扩大原生工具的执行入口。其现有工具和行为不变。若用户另行要求支持，再讨论手动调用是否保留免审批，并显式扩大 SHAPE，而不是悄悄复用聊天工厂。

## 7. 为什么不采用另外两种结构

| 候选 | 代码和实际行为 | 本轮取舍 |
|---|---|---|
| 启动一次发现，同步工厂读快照 | 生命周期承担异步，聊天保持现有同步构造；重载才更新目录 | 推荐；代价是启动短暂等待和运行期间清单可能陈旧 |
| 每个 executor 自己发现 | 工厂变异步，或每个 executor 增加就绪/补注册；全局面板与聊天可持有不同目录 | 没有接受的隔离需求支撑重复发现，暂不采用 |
| 启动后台发现并热更新所有 executor | 聊天可立即创建，但需要响应式 registry、订阅/解绑、选择保留及更新时机规则 | 超出当前需要；不因异步加载本身建设这些机制 |

这次主要把 MCP 协议和定义适配的变化集中到两个新文件。代价可在同源/协议失败时从 MCP 状态定位，而不必从聊天树反查。框架只增加一个组内初始默认值，不引入 ToolSource/Provider 插件平台、通用资源管理器或重连状态机。

## 8. 验证门槛、未定项与评审

### 实施前技术门槛及结果

先有 Node→dev 3.8.8 的零依赖通信证据，本轮又在用户指定 dev 的真实浏览器前端验证同源 initialize/list/system.version/DELETE，随后以生产 client/桥接/executor 重跑通过，未读取 token 或笔记。同源传输路线不需要另一套依赖或认证配置。该隔离浏览器未加载插件主界面，因此完整插件上下文、带认证实例仍在宿主验收边界；若后续证据要求改变认证/传输结构，须将 SHAPE 退回 draft，带证据回到用户，不静默加 token 配置或代理服务。

首版采用已实测的 2025-03-26 JSON 响应分支，分页必须完整读取；不实现 SSE 订阅或另一个协议分支。不能因只验证 dev 3.8.8 就修改最低宿主版本。带认证实例、独立窗口及较旧宿主的实际表现仍须分项验证。

### 自动验证与宿主验收

- 假宿主验证请求顺序、session/版本 header、分页、握手超时/失败/取消、会话关闭及 session 失效后不重试。启动集成必须覆盖：旧入口在重新启动期间打开、容器等待期间关闭、旧扩展完成晚到及禁用/重新启用，不能只测纯 client。
- 使用真桥接和 executor 验证：默认全不选、保存覆盖生效、A/B 独立、审批拒绝时零 tools/call、默认成功不二次审批、按名调用不被本地开关禁止。
- 验证 text、structuredContent、isError、混合未支持内容、未知 schema 及名称冲突，不用错误重试掩盖问题。验证真实权限页面单项/批量修改保留另一类有效策略，不用复制业务逻辑的假实现。
- 复用工具链和 lifecycle 版本回归，不为 MCP 另建聊天模拟器；现有 type-check/树菜单基线失败继续单列，不能冒充通过。
- 宿主确认启动等待/失败提示、两个选择面板、权限覆盖、旧历史/版本切换、独立窗口，以及“新建对话”仍复用选择；GPT 重启后旧标签原生工具失效、重开标签恢复。Tool Hub 不应出现原生工具。

### 已接受的首版边界

启动快照及 5 秒等待上限；失败后保持本次启动 unavailable、重载后再尝试；统一渲染就绪边界；稳定前缀；schema/结果首版范围；旧组件不自动换绑、须重开标签而非仅点“新建对话”；直接相交的权限页修复；原生 skill 非自动集成；首版不纳入 Tool Hub。

独立评审的首轮结论为“实施前须修订”：三个阻碍分别是旧入口绕过启动顺序、“新建对话”并不重建 executor、权限页单项修改丢失真实默认值。主代理已逐项核对源代码，并在本版明确统一就绪入口、保留组件/会话区别及最小权限页修复；同时按范围建议移除首版 Tool Hub 改动。详细证据与处置见 `gpt-tools-cleanup.ARCH-REVIEW.md`。

用户已授权开始实施。当前已在真实 dev 3.8.8 浏览器前端用生产 client/桥接/executor 验证同源握手、30 工具发现、默认不选/单工具选择、一次审批、system.version 和 DELETE，无 token 读取；该隔离浏览器未加载插件主界面，不算完整插件验收。已加载插件、带认证实例、独立窗口和旧宿主仍须保留未验证边界。出现职责或范围的实质扩张时，将状态退回 draft 并先与用户讨论。

## 9. 实施对照（保留上方接受时预测，不回填数字掩盖偏差）

- 生产代码仍只有两个新增文件，净增约 **565 行**，在总预测 450–700 内；其余源文件均在预测范围。client 为 322 行，高于单文件预测 180–260，主要是显式响应校验、取消监听归属和有界 session 清理；桥接 162 行，GPT 入口净增 45 行。没有新增通用层或修改 Provider/聊天树/存储。
- 测试与 runner 净增约 **814 行**，高于预测 280–450。实际把 client 与桥接分成两个测试文件，另加真实 GPT 启动 owner 的集成测试及 183 行 UI/平台边界 fixture；不是用另写的状态机代替真实 owner。传输 6、桥接 6、启动 3、权限页 3 项及原工具组默认值回归共新增 19 项，工具总测试为 30。
- 额外修改 `.dev/docs/gpt-module-architecture-overview.md`，同步已有启动入口索引，属于文档一致性更新，不新增产品职责。
- 实际 schema 中 bazaar/file 的 limit 表示条数/行数。桥接通过既有 truncateForLLM 钩子沿用默认字符上限，防止 executor 将原生 limit 误解为输出字符数；未增加参数、UI 或截断框架。
- 两轮独立评审的必要处置已落地；实现后复核修正终态提示及无效 text 的诊断，未建设新的共享冲突状态通道。所有代码锚点已移除。
- 最终 GPT 117、配置 7、webview 10 项通过，发布/个人构建均通过；类型检查仍只有 5 个基线诊断。`completed` 指源码实施与 diff 对照完成，**不代表完整插件宿主/Provider 或用户体验验收完成**；剩余门槛由 PLAN [I7]/[I8] 管理。
