---
change: "standard-replay-backend"
updated: "2026-06-24"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: 类型与配置 ✅
- [x] `IChatSessionConfig` 增 `toolCallMode: 'standard' | 'legacy'` `src/func/gpt/types.ts`
- [x] `defaultConfig` 增 `toolCallMode: 'standard'` `src/func/gpt/model/config.ts`
- [x] `IMessagePayload` 增可选 `toolChainMessages?: IMessage[]`（含 JSDoc：判定规则、顺序、reasoning 剥离说明）`src/func/gpt/types-v2.ts`
- [x] `msg_migration.ts` 无需改动（V1 无此字段，V2 JSON 直接加载自然含新可选字段）`src/func/gpt/model/msg_migration.ts`
**Verification**: tsc 通过；旧历史加载无报错；`toolCallMode` 默认 `'standard'`。
**User Check**:
1. 重新加载插件，打开一个**已有旧会话** → 历史消息正常显示，无报错弹窗 = 迁移无损。
2. 新建会话 → 打开 session 设置 → 看到 `toolCallMode` 选项，默认值为 `standard` = 配置生效。

### Phase 2: finalize 切分 (Feat C 核心) ✅
- [x] `handleToolChain` 增 Standard 分支：从 `result.messages.toolChain` 切分；末元素 role 校验（非 assistant → 合成空 `message` fallback）；`toolChainMessages` strip assistant reasoning；`message` 保留末条 reasoning；不设 `userPromptSlice` `src/func/gpt/chat/ChatSession/use-openai-endpoints.ts`
- [x] Legacy 分支保持现状（确认未破坏 `toolChainContent + responseContent` + `userPromptSlice=[hintSize,len]`）`src/func/gpt/chat/ChatSession/use-openai-endpoints.ts`
- [x] 抽 `stripReasoning(msg)` 辅助（剥 assistant 的 `reasoning_content`；tool no-op）`src/func/gpt/chat/ChatSession/use-openai-endpoints.ts`
**Verification**: standard 模式含工具调用消息 → 持久化 payload 有 `toolChainMessages`（序列、无末条 assistant、无 reasoning）、`message`=末条 assistant、无 `userPromptSlice`；legacy 模式行为不变。
**User Check**:
1. standard 模式下，发一条会触发工具调用的问题（如"现在几点"触发时间工具，或"搜一下 X"触发搜索工具）。
2. 等回复完成 → 消息格显示**最终回复文本**（不是压缩的 `[Tool Execution Log]` 块）。
3. 格子下方的「工具调用 (N 次)」折叠按钮**仍可展开** → 展开后看到 tool 调用 timeline（此即 `toolChainResult` 仍生效的证据）。
4. 打开浏览器/桌面端开发者工具 → 在持久化 JSON（`gpt-cache/{id}.json` 或 localStorage `gpt-chat-{id}`）里找到该条 payload → 存在 `toolChainMessages` 字段、`message.content` 为最终回复、**无** `userPromptSlice` = 切分正确。
5. 切到 legacy 模式重发同样问题 → 消息格显示旧式压缩串（含 `[Tool Execution Log]` 内嵌块），payload 有 `userPromptSlice`、无 `toolChainMessages` = legacy 未破坏。

### Phase 3: 回放分流 (Feat D / F) ✅
- [x] `getAttachedHistory` 末尾 `.map` 改 `.flatMap`：standard cell（有 `toolChainMessages`）→ `[...toolChainMessages, message]`；legacy cell → `[message]`（不 strip） `src/func/gpt/chat/ChatSession/use-chat-session.ts`
- [x] 确认窗口计数仍按 item（=turn），展开发生在窗口选定后 `src/func/gpt/chat/ChatSession/use-chat-session.ts`
**Verification**: standard 会话续对话时，发给 LLM 的 messages 含真实 `assistant(tool_calls)` + `role:tool` 序列；legacy cell 混入时整段单条回放。
**User Check**:
1. standard 模式下，先发一条触发工具调用的问题（产生 standard cell），**再发一条追问**（如"基于刚才的结果，再总结一下"）。
2. 观察 LLM 的回复**是否自然承接工具结果**——若 LLM 表现得清楚知道工具返回的完整内容（而非只看到压缩日志摘要），即回放含完整结构的证据。
3. 进阶核实（可选）：在 `executeToolChain`/`complete` 调用处临时加 console.log 打印 `messagesToSend` → 续对话时控制台可见 `role:'tool'` 与 `tool_calls` 真实消息项 = 回放分流生效。
4. 混合回放：在同一个 standard 会话里，找到一条旧 legacy cell（或临时造一条），其后追问 → LLM 不报错、对话不中断 = legacy 整段单条回放兼容。

### Phase 4: addVersion 整组拷贝 (Feat E) ✅
- [x] `addMsgItemVersion` 整组拷贝 `toolChainMessages` + `toolChainResult` + `userPromptSlice`(presence 拷)；仅 `message.content` 不同 `src/func/gpt/chat/ChatSession/use-chat-session.ts`
**Verification**: 对 standard cell 手动加版本 → 切换版本后 `toolChainMessages`/`toolChainResult` 仍在；timeline 不丢；legacy cell 加版本仍拷 `userPromptSlice`。
**User Check**:
1. 对一条 standard 工具调用回复格子 → 右键/菜单「编辑」→ 改写最终回复文本 → 保存（产生新版本）。
2. 在版本切换器（version view）切换回旧版本 → 旧最终回复恢复。
3. **两个版本下方都仍显示「工具调用 (N 次)」折叠按钮且内容一致** = toolChainResult 整组拷贝成功（未退化丢结构）。
4. 对一条 legacy 格子重复 1-3 → 切换版本后旧式压缩串恢复、`userPromptSlice` 行为正常 = legacy addVersion 未破坏。

### Phase 5: session 设置 UI 开关 ✅
- [x] session 配置 UI 加 `toolCallMode` 切换（standard / legacy），最小入口 `src/func/gpt/setting/ChatSetting.tsx`
**Verification**: 切换后 config 持久化；新 turn 按所选模式持久化；旧会话切到 standard 后旧 cell 仍 legacy 回放、新 turn 为 standard。
**User Check**:
1. 打开 session 设置 → 切换 `toolCallMode` 为 legacy → 保存。
2. 发一条触发工具调用的问题 → 消息格显示旧式压缩串（含内嵌日志块）= 模式切换对新 turn 生效。
3. 切回 standard → 再发一条 → 消息格显示最终回复 + 折叠 timeline = standard 生效。
4. 关闭会话再打开 → 设置保持所选模式 = 持久化生效。
5. 同一会话里既有旧 legacy 格子又有新 standard 格子 → 续对话不报错 = 混合兼容。

### Phase 6: 集成验证 ✅
- [x] 代码侧：tsc / type-check 通过，无类型错误
- [x] 端到端：用户在思源中测试基本常用操作（工具调用、续对话、编辑、版本、legacy 回归）基本 OK；未全测但核心路径通过
- [x] legacy 回归：切 legacy 模式行为同改动前
- [x] 导出回归：XML 导出含 `toolChainResult` JSON block
**Verification**: 上述全部通过；无 tsc/lint 报错。
**User Check**:
1. **多轮工具调用**：standard 模式下发需要连续 2+ 次工具调用的问题（如"先搜 X 再搜 Y 然后对比"）→ 回复正常、续对话承接完整。
2. **rerun**：对一条 standard 工具调用格子点「重跑」→ 产生新版本，新版本仍有完整 timeline 与 `toolChainMessages`。
3. **edit 不 drift**：编辑最终回复 → 切到其他对话再切回 → 编辑后内容保持；续对话时 LLM 看到的是编辑后文本（而非旧文本）= 唯一源无 drift。
4. **fallback**：临时把 `toolCallMaxRounds` 设为 1，发一个会触发 2+ 工具调用的问题触发 maxRounds 兜底 → 不崩、格子显示（可能为空最终回复 + incomplete tool timeline）= fallback 生效。
5. **legacy 回归**：切 legacy 模式重复 1-3 → 行为与改动前完全一致。
6. **导出**：对含 standard 工具调用格子的会话导出 XML → 打开导出文件 → 含 `<ToolChain>` JSON 块 + 最终回复文本 = 导出信息量不减。

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: 类型与配置 | 100% | ✅ |
| Phase 2: finalize 切分 | 100% | ✅ |
| Phase 3: 回放分流 | 100% | ✅ |
| Phase 4: addVersion 整组拷贝 | 100% | ✅ |
| Phase 5: session 设置 UI 开关 | 100% | ✅ |
| Phase 6: 集成验证 | 100% | ✅ |

**Recent**:
- 代码实现完成（Phase 1-5），tsc/type-check 通过。
- 用户在思源中测试基本常用操作基本 OK；未全测但核心路径通过。Phase 1 进入 REVIEW。
