# 原生 MCP SHAPE：独立架构与可维护性评审

评审对象：`gpt-tools-cleanup.SHAPE.md` 的首版启动快照提案，不是已实现 diff。主代理委派独立 subagent（无父会话上下文，只读代码与目标/提案），要求检查职责、状态归属、调用顺序、维护成本和范围扩张。评审未运行测试、构建或网络探针，也未修改文件。

**首轮结论：方向可行，但实施前须修订。** 下列三个阻碍均由主代理核对源码并纳入修订；用户随后批准开始实施。以下首轮行号引用基于 b4a05f9 的未实施源码，当前代码以符号为准。实施后又委派独立 subagent 做源码复核，结果及主代理处置见末节；两种评审均不代替真实宿主验收。

## 1. 只靠初始化后注册入口，不能保证所有组件都等到就绪

**评审发现。** 现有 GPT unload 不移除所有菜单/Tab/Dock；重新启用期间，旧回调仍可能构造 ChatSession。旧自定义扩展的异步完成回调也只检查 enabled，新一轮启动将其设为 true 后，旧回调可能误加 Dock。

源码依据：

- `src/func/gpt/index.ts:147–199`：openChatTab 直接 render ChatSession，beforeDestroy 调用 disposer。
- `src/func/gpt/index.ts:227–245`：独立窗口 Tab 的直接构造/销毁路径。
- `src/func/gpt/index.ts:341–375`：Dock 的直接构造/销毁路径。
- `src/func/gpt/index.ts:79–84`：启动扩展完成后只用 enabled 判断是否添加 Dock。
- `src/func/gpt/index.ts:516–530`：unload 清理点击事件/URL 事件/文档对话，但没有清掉全部上述入口。
- `src/settings/persistence.ts:423–430`：模块开关调用异步 toggleEnable，不在设置回调中串行等待，不能假设启停无重叠。

**后果。** executor 可能在快照尚未发布时构造，从此缺少原生组；“启动完成后工厂同步读缓存”的前提没有单一保证者。

**主代理处置：采纳，修订 SHAPE §3/§4。** GPT index.ts 持有本次生命周期 signal/初始化 Promise；三处渲染统一经过本地就绪渲染函数，等待期间容器销毁则不挂载。旧扩展完成回调也核对本次 signal。保持一次发现，不把发现或补注册分摊给各聊天，不重做整个插件生命周期。该集成现已实现；真实启动 owner 的 3 项回归覆盖延迟构造/关闭、禁用重启及旧扩展晚到，尚不等于完整宿主 UI 验收。

## 2. 界面“新建对话”没有新建 executor

**评审发现。** 首版提案混用了“新会话”和“新 ChatSession 组件”，导致“GPT 重启后新聊天使用新连接”的表述不准确。

源码依据：

- `src/func/gpt/chat/main.tsx:1038–1041`：新建对话按钮调用 newChatSession。
- `src/func/gpt/chat/main.tsx:286–294`：newChatSession 继续调用已有 session.newSession。
- `src/func/gpt/chat/ChatSession/use-chat-session.ts:81–83`：executor 在 useSession 初始构造。
- `src/func/gpt/chat/ChatSession/use-chat-session.ts:678–700`：newSession 清空树和会话字段，不重建 executor。

**后果。** GPT 禁用/重启后，在旧标签点“新建对话”仍持有已关闭的原生 client；新保存的全局工具默认值也不会重新应用。这不是 MCP 可以在局部偷偷改变的现有行为。

**主代理处置：采纳，收窄合同，不增加热更新。** SHAPE 明确保留按钮复用 executor/选择的现状。首版重建原生连接后需关闭并重开聊天标签页/窗口，旧组件不自动换绑；这一限制已随用户实施授权接受，并由旧 executor 不调用新 client 的回归保护。两个 chat 文件在预测树中列为决策相关的 no change，而不是遗漏。如果用户不接受此限制，应先修订 SHAPE，不能边实施边引入 executor 更新机制。

## 3. 只修改结果审批，权限页面可能同时关闭执行审批

**评审发现。** 页面保存一个策略时，使用只有 name 的假工具查询另一个策略，真实工具默认值会丢失。

源码依据：

- `src/func/gpt/setting/tool-permission-manager.html:529–540`：有效策略先查覆盖，再查工具默认值，最后回落 auto/never。
- `src/func/gpt/setting/tool-permission-manager.html:549–568`：单项修改传入 `{ name: toolName }`，缺少真实默认策略。
- `src/func/gpt/setting/ToolsManagerSetting.tsx:119–126`：保存完整的执行/结果覆盖值。
- `src/func/gpt/tools/executor.ts:313–321`：executor 正确优先使用用户覆盖，无法分辨该 auto 是页面误造的。

**具体失败。** 原生工具默认 ask-always/never，没有覆盖。用户只把结果审批改成 always，页面生成 auto/always；保存后执行前不再询问。

**主代理处置：采纳，纳入最小必要修复。** SHAPE 新增权限 HTML 的预计改动：两类单项更新均查找页面已有的真实工具对象，保留未修改策略的有效值，不变更覆盖格式。实现及 3 项真实页面数据逻辑回归已完成，覆盖单项保存、重置和批量路径。该问题在 PLAN [I15] 单列关闭，不借此修复整个权限系统；iframe 实际交互仍待宿主验收。

## 4. Tool Hub 接入是额外产品范围，不是清单共享的必然要求

**评审发现。** 原生组出现在聊天中，并不意味着还必须加入手动免审批入口。

源码依据：`src/func/gpt/tools/manual-execute.ts:23–46` 另建 executor 并启用所有组，`:97–103` 明确跳过执行/结果审批。

**主代理处置：采纳范围建议。** 首版 SHAPE 改为不纳入 Tool Hub/手动选择器，该文件 no change。既有手动工具行为不变；以后确有需求再讨论原生工具是否同样免审批，不从聊天默认 ask-always 推导授权。

## 评审认可与未验证边界

评审认可 transport/bridge 拆分、启动目录与聊天状态分离、用组内默认值避免 UI 按前缀特殊判断，以及按实际 Provider 能力限制 schema、按 executor 的失败格式化行为传递完整错误。这些是结构判断，不是运行验证。

renderer 同源认证仍是实施前探针门槛；5 秒启动等待、重载恢复、前缀、结果范围和旧组件重开限制仍需用户决定。后续实施沿用这些范围约束，没有把已有审批/中断缺陷扩大为本轮默认修复范围。

## 实现后独立源码复核（2026-10-31）

另一个只读 subagent 检查了真实源码 diff、两个新增生产模块及回归测试。其结论认为实现符合已接受 SHAPE，提出三项具体诊断意见，主代理独立判断如下：

1. **采纳：取消后保留容器可能一直显示“正在启动”。** 已在统一渲染入口补充明确取消/重开提示；已关闭容器仍不改写、不挂载。启动回归新增终态提示断言。
2. **不采纳全局状态改写建议：本地名称冲突后，ready 目录统计可能与某个 executor 的注册结果不同。** 目录状态归共享发现所有，不能让单个工厂的冲突反向改写它。保持接受时的行为：该工厂跳过原生组，并用现有可见 toast 说明原因；不为罕见冲突另建状态通道。这是保留的诊断局限，不是已修复项目。
3. **采纳：无效 text 项不应被标为“不支持 text 类型”。** 桥接现在区分支持类型的格式错误与未支持类型，保留其余可读内容；相应断言通过。

此外主代理检查 transport 时发现初始化协议元信息不合法会在保存已知 session 之前抛错；worker 已调整保存顺序，并新增拒绝协议后仍 DELETE 该 session 的回归。没有增加重试、重连或另一种协议。

最终 117 项 GPT 回归、7 项配置回归、10 项 webview 回归、两种构建通过；类型检查仍只有既有 5 个基线错误。生产 client/桥接/executor 在真实 dev 浏览器同源路径验证通过，但该浏览器未加载插件主界面，没有真实模型请求。详细运行边界与日志见 PLAN/METHOD。
