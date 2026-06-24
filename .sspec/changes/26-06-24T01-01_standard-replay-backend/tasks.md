---
change: "standard-replay-backend"
updated: "2026-06-24"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: 类型与配置 ⏳
- [ ] `IChatSessionConfig` 增 `toolCallMode: 'standard' | 'legacy'` `src/func/gpt/types.ts`
- [ ] `defaultConfig` 增 `toolCallMode: 'standard'` `src/func/gpt/model/config.ts`
- [ ] `IMessagePayload` 增可选 `toolChainMessages?: IMessage[]`（含 JSDoc：判定规则、顺序、reasoning 剥离说明）`src/func/gpt/types-v2.ts`
- [ ] `msg_migration.ts` 透传 `toolChainMessages`（旧数据无此字段 → undefined）`src/func/gpt/model/msg_migration.ts`
**Verification**: tsc 通过；旧历史加载无报错；`toolCallMode` 默认 `'standard'`。

### Phase 2: finalize 切分 (Feat C 核心) ⏳
- [ ] `handleToolChain` 增 Standard 分支：从 `result.messages.toolChain` 切分；末元素 role 校验（非 assistant → 合成空 `message` fallback）；`toolChainMessages` strip assistant reasoning；`message` 保留末条 reasoning；不设 `userPromptSlice` `src/func/gpt/chat/ChatSession/use-openai-endpoints.ts`
- [ ] Legacy 分支保持现状（确认未破坏 `toolChainContent + responseContent` + `userPromptSlice=[hintSize,len]`）`src/func/gpt/chat/ChatSession/use-openai-endpoints.ts`
- [ ] 抽 `stripReasoning(msg)` 辅助（剥 assistant 的 `reasoning_content`；tool no-op）`src/func/gpt/chat/ChatSession/use-openai-endpoints.ts` 或 chat-utils
**Verification**: standard 模式发送含工具调用的消息 → 持久化 payload 有 `toolChainMessages`（序列、无末条 assistant、无 reasoning）、`message`=末条 assistant、无 `userPromptSlice`；legacy 模式行为不变。

### Phase 3: 回放分流 (Feat D / F) ⏳
- [ ] `getAttachedHistory` 末尾 `.map` 改 `.flatMap`：standard cell（有 `toolChainMessages`）→ `[...toolChainMessages, message]`；legacy cell → `[message]`（不 strip） `src/func/gpt/chat/ChatSession/use-chat-session.ts`
- [ ] 确认窗口计数仍按 item（=turn），展开发生在窗口选定后 `src/func/gpt/chat/ChatSession/use-chat-session.ts`
**Verification**: standard 会话续对话时，发给 LLM 的 messages 含真实 `assistant(tool_calls)` + `role:tool` 序列（控制台打印 / 网络面板核实）；legacy cell 混入时整段单条回放。

### Phase 4: addVersion 整组拷贝 (Feat E) ⏳
- [ ] `addMsgItemVersion` 整组拷贝 `toolChainMessages` + `toolChainResult` + `userPromptSlice`(presence 拷)；仅 `message.content` 不同 `src/func/gpt/chat/ChatSession/use-chat-session.ts`
**Verification**: 对 standard cell 手动加版本 → 切换版本后 `toolChainMessages`/`toolChainResult` 仍在；timeline 不丢；legacy cell 加版本仍拷 `userPromptSlice`。

### Phase 5: session 设置 UI 开关 ⏳
- [ ] session 配置 UI 加 `toolCallMode` 切换（standard / legacy），最小入口 `src/func/gpt/chat/session-setting.tsx`
**Verification**: 切换后 config 持久化；新 turn 按所选模式持久化；旧会话切到 standard 后旧 cell 仍 legacy 回放、新 turn 为 standard。

### Phase 6: 集成验证 ⏳
- [ ] 端到端：standard 模式多轮工具调用 → 续对话回放含完整结构；rerun 产新 standard payload；edit 最终回复不 drift；addVersion 不丢结构；maxRounds follow-up 异常时 fallback 合成空 `message` 不崩
- [ ] legacy 回归：切 legacy 模式 → 行为同改动前（压缩串 + userPromptSlice）
- [ ] 导出回归：XML 导出 standard cell 仍含 `toolChainResult` JSON block，`message.content`=最终回复
**Verification**: 上述全部通过；无 tsc/lint 报错。

---

## Progress

**Overall**: 0%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: 类型与配置 | 0% | ⏳ |
| Phase 2: finalize 切分 | 0% | ⏳ |
| Phase 3: 回放分流 | 0% | ⏳ |
| Phase 4: addVersion 整组拷贝 | 0% | ⏳ |
| Phase 5: session 设置 UI 开关 | 0% | ⏳ |
| Phase 6: 集成验证 | 0% | ⏳ |

**Recent**:
- (none yet)
