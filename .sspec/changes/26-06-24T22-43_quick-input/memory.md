# Memory: quick-input

**Updated**: 2026-06-25T15:56

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/SiYuanDevelopment/sy-f-misc`
- Branch: `feat/quick-input`
- HEAD: `ca2106328e0ec9181bc9b8214d73dec2a0611499`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## feat/quick-input...origin/feat/quick-input [gone]
```

## State
Implementation + revision 002 + external review follow-up + UI/UX review 003 进行中，`spec.md` 状态为 REVIEW。Agent 验证 `pnpm run type-check` 与 `pnpm run build` 均通过；SiYuan runtime 验证已由 subagent 完成（见 `reference/runtime-verification-report.md`），IAL/hpath 父路径/同 hpath 行为均已验证。

## Key Files
- `.sspec/changes/26-06-24T22-43_quick-input/spec.md` — 问题、BC-1..BC-5、实现项、scope
- `.sspec/changes/26-06-24T22-43_quick-input/design.md` — 架构选型、schema 收敛、管线、接口、YAGNI ledger、风险
- `.sspec/changes/26-06-24T22-43_quick-input/reference/input-template-type-draft.d.ts` — 用户初版类型草案（已被 design.md §3 收敛）
- `src/func/quick-input/types.ts` — QuickInputTemplate schema；revision 001 将 mode 改为 append/prepend/before/after
- `src/func/quick-input/config.ts` — load/dump + `saveTemplates()` 主动合并写 `custom-module.config.json`
- `src/func/quick-input/engine.ts` — `${var}` 渲染、ctx 解析、document/block 插入执行管线
- `src/func/quick-input/panel.tsx` — `Alt+I` 触发面板
- `src/func/quick-input/setting.tsx` — 独立 Tab CRUD UI
- `src/func/quick-input/index.ts` — module load/unload、命令、菜单、setting panel
- 参照模块：`src/func/quick-draft/index.ts`（command+菜单模式）、`src/func/gpt/index.ts`+`src/func/toggl/index.ts`（declareSettingPanel 独立 Tab）、`src/libs/dialog.ts`（solidDialog/simpleFormDialog）、`src/libs/components/simple-form.tsx`（SimpleForm）

## Knowledge
- [2026-06-24] [Decision] 架构选 Option A（文件分解 + 单深引擎 executeTemplate + switch 派发 + 扁平 var 字典），否决 B（策略/注册表，YAGNI/shallow over-decomposition）与 C（单文件膨胀）
- [2026-06-24] [Decision] CRUD UI 用独立 Tab `declareSettingPanel`（用户定，参考 GPT/Toggl），非 customPanel
- [2026-06-24] [Rejected] dailynote 不单列为 insertTo 类型——是 block 的样板（`anchorId="${todayDailynoteId}"`）
- [2026-06-24] [Rejected] `IBasicVar/IMidVar/ITemplateVar` 三层变量接口——过早分层，收敛为单一 evolving `ctx`
- [2026-06-24] [Rejected] `IDeclaredInputVar` 自定义表单规范——复用 `SimpleFormField`
- [2026-06-24] [Decision] pre/postExecuteScript、SQL/JS anchorGenerator、Squirrelly 逻辑模板、光标插入全部 defer；schema 预留字段位，引擎不接线
- [2026-06-24] [Insight] pre 脚本的本质只有两件事：动态算一个 var、动态选定插入位置。MVP 用"模板化 anchorId/hpath + 内置 var 字典（含 todayDailynoteId）"覆盖 80%，无脚本子系统
- [2026-06-24] [Insight] kramdown IAL `{: custom-x="y"}` 在模板里自带块属性 = 覆盖 postExecuteScript 最常见用途，故 post-script 干净 defer
- [2026-06-24] [Constraint] 与 quick-draft 无关，不动 quick-draft 任何文件（quick-draft = 全局快捷键召唤小窗编辑器，定位不同）
- [2026-06-24] [Constraint] 快捷键 `Alt+I`（与 quick-draft `Shift+Alt+G` 不冲突）
- [2026-06-24] [Gotcha] `insertBlock(dataType, data, nextID?, previousID?, parentID?)` 签名：before 传 nextID=anchor；after 传 previousID=anchor；不传 parentID（`api.d.ts:35`）
- [2026-06-24] [Gotcha] 模板 IAL 只写 `custom-*`，不写死 `id`（块 id 冲突）
- [2026-06-24] [Decision] P-1 定 (a-flat)：insertTo.block 带可选 notebook 字段，引用 ${todayDailynoteId} 时必填；日记样板是 setting UI 快捷填充动作，不新增顶层字段
- [2026-06-24] [Decision] 模板插值定界符用 ${var}（非 {{var}}），避免与思源 kramdown 嵌入块 {{...}} 语法冲突；render 正则 /\$\{(\w+)\}/g，字面量 \${abc} 转义
- [2026-06-24] [Gotcha] 思源 kramdown 嵌入块语法 {{...}} 与模板插值冲突——不用 {{var}}
- [2026-06-24] [Decision] Verification 边界：Agent 只声明可跑 type-check/build/纯逻辑临时断言/API d.ts 静态确认；SiYuan runtime（内核 IAL/hpath/同名、UI 快捷键、真实插入位置）全部放 User Check 或 runtime-verification.md
- [2026-06-25] [Gotcha] Runtime verification shows `createDocWithMd` silently creates duplicate documents for the same hpath; engine now guards document mode with `getIDsByHPath` + confirm before creating another duplicate
- [2026-06-25] [Review] External review follow-up: accepted regex factory and `declaredInputVar` normalization; treated number empty default as optional semantic cleanup; treated `InsertMode` type-only import as not-a-bug and added a clarifying comment
- [2026-06-25] [Review] UI/UX review: fix setting panel scroll, reposition daily-note quick-fill, add help doc, support `${todayDailynoteId:<notebookId>}` inline syntax; notebook picker deferred

## Milestones
- [2026-06-24T22:43] Clarify 完成，change 创建
- [2026-06-24T22:55] Design 完成 spec.md + design.md，GATE 3 对齐通过
- [2026-06-24T23:05] Plan 完成 tasks.md（Phase 0 验证 + Phase 1-4 实现）
- [2026-06-24T23:18] 用户指出 verification 边界错误；tasks.md 已修正为 Agent 可验证 vs SiYuan runtime User Check
- [2026-06-25T00:55] 进入 Implement 前发现 mode 命名歧义；用户确认 next/prev 改 before/after，已记录 revision 001；用户明确要求先 git commit 设计/计划 checkpoint 再继续实现
- [2026-06-25T01:38] Implementation 完成；`pnpm run type-check` 与 `pnpm run build` 通过；进入 REVIEW
- [2026-06-25T02:22] Runtime report accepted as review feedback; revision 002 implemented duplicate hpath guard; `pnpm run type-check` 与 `pnpm run build` 通过
- [2026-06-25T15:44] External review follow-up implemented; `pnpm run type-check` 与 `pnpm run build` 通过
- [2026-06-25T15:49] Corrected external review follow-up wording to distinguish accepted issues, optional semantic cleanup, and not-a-bug note
- [2026-06-25T15:54] Revision 003 created; UI/UX review tasks added; status stays REVIEW
- [2026-06-25T15:56] Revision 003 implemented; `pnpm run type-check` 与 `pnpm run build` 通过
