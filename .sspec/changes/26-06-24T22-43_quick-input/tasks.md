---
change: "quick-input"
updated: "2026-06-25T01:38"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

<!-- Verification boundary:
Agent 可验证：type-check/build、纯函数临时断言、API d.ts 签名、代码结构。
User/SiYuan 环境可验证：内核行为（IAL/hpath/同名）、快捷键、设置面板、真实插入位置。
不再把“打开思源开发者控制台手动调用 API”写成 Agent Verification。 -->

### Phase 0: 验证边界与运行时检查材料 ✅
- [x] `reference/runtime-verification.md` 写 SiYuan 运行时检查步骤：V-1 IAL 解析、V-2 父路径缺失、V-3 同 hpath 已存在、block append/prepend/before/after 插入位置
- [x] 静态确认 `@frostime/siyuan-plugin-kits` API 签名：`createDocWithMd` / `appendBlock` / `prependBlock` / `insertBlock` / `createDailynote` / `openBlock` / `getBlockByID`
- [x] `reference/runtime-verification.md` + `memory.md` 记录 V-1/V-2/V-3 为“需 SiYuan runtime 验证”，不作为 Agent 实现阻塞项；mode 命名修正见 `revisions/001-rename-block-modes-before-after.md`
**Verification**:
- Agent: `reference/runtime-verification.md` 存在，且每个检查都有用户可复制的步骤/期望结果
- Agent: API 签名来源记录到 `memory.md`（文件路径或 `.d.ts` 行号）
**User Check**:
1. 在 `pnpm run dev` + SiYuan 插件环境中按 `runtime-verification.md` 执行 V-1/V-2/V-3 与 block mode 检查

### Phase 1: schema 与 config 基座 ✅
- [x] `src/func/quick-input/types.ts` 定义 `QuickInputTemplate` / `InsertTo` / `InsertMode` / `DeclaredVar` / `QuickInputConfig`（按 design.md §3；含 deferred 字段位但引擎不接线）
- [x] `src/func/quick-input/config.ts` 实现 `declareModuleConfig`（key=`quick-input`，load/dump `QuickInputConfig`）+ `getTemplates()`/`saveTemplates()`；load 时补全缺省字段
- [x] `src/func/index.ts` 注册 `quick-input` 模块到 `_ModulesToEnable`
**Verification**:
- Agent: `pnpm run type-check` 通过
- Agent: `pnpm run build` 通过
- Agent: 静态检查 `src/func/index.ts` 已注册模块，`config.ts` dump/load 类型与 `QuickInputConfig` 对齐
**User Check**: 无

### Phase 2: engine 深引擎 ✅
- [x] `src/func/quick-input/engine.ts` 实现 `${var}` 渲染、字面量 `\${abc}` 转义、未定义 key → 空串
- [x] `engine.ts` 实现内置 var 字典（时间系列 + `todayDailynoteId`，lazy 求值，仅解析实际引用的 var）
- [x] `engine.ts` 实现 `resolveCtx(tpl, userInput)`：内置 var ⊕ userInput → ctx
- [x] `engine.ts` 实现 `executeTemplate(tpl, userInput)`：document/block dispatch + mode 映射 + openBlock；错误（anchorId 解析失败等）→ `showMessage` 并抛中止
- [x] `engine.ts` 不依赖 UI；纯逻辑尽量拆成可临时断言的 helper（不新增正式测试框架）
**Verification**:
- Agent: `pnpm run type-check` 通过
- Agent: `pnpm run build` 通过
- Agent: 用临时脚本或等价最小断言验证纯逻辑：`${title}` 插值、`\${title}` 保留字面量、未定义 key 为空串、只提取实际引用 var、用户输入覆盖/合并行为；临时脚本不提交
- Agent: 静态检查 mode 映射调用：append→`appendBlock`，prepend→`prependBlock`，before→`insertBlock(nextID=anchor)`，after→`insertBlock(previousID=anchor)`
**User Check**:
2. 在 SiYuan runtime 中按 `runtime-verification.md` 验证 document 创建与 block append/prepend/before/after 插入位置

### Phase 3: 触发面板 ✅
- [x] `src/func/quick-input/index.ts` `load`：`addCommand` 注册 `Alt+I`（`translateHotkey('Alt+I')`，langKey/openQuickInput）+ `registerMenuTopMenu('QuickInput', ...)`；`unload` 清理
- [x] `src/func/quick-input/index.ts` `declareToggleEnabled`（默认 false）
- [x] `src/func/quick-input/panel.tsx` 实现 `openPanel()`：`solidDialog` 按 group 分组渲染预设按钮（无预设空态）；选中 → 有 `declaredInputVar` 则 `simpleFormDialog` → 调 `executeTemplate`
- [x] `panel.tsx` 表单 fields 从 `DeclaredVar[]` 映射到 `SimpleFormField[]`
**Verification**:
- Agent: `pnpm run type-check` 通过
- Agent: `pnpm run build` 通过
- Agent: 静态检查 `unload` 清理 command/menu，`panel.tsx` 不直接依赖内核 API（只调用 engine/config/dialog）
**User Check**:
3. BC-1: 启用模块后 `Alt+I` 呼出按 group 分组的预设面板；无预设时空态提示
4. BC-2: document 预设点击 → 填表 → 创建文档并打开
5. BC-3: block 预设点击 → 填表 → 插入块并按 openBlock 决定是否打开

### Phase 4: 设置面板模板 CRUD ✅
- [x] `src/func/quick-input/setting.tsx` 实现 `QuickInputSetting`（`declareSettingPanel` element，参考 `src/func/toggl/setting.tsx` SolidJS 组件模式）
- [x] `setting.tsx` 预设列表 + 新增/编辑/删除按钮；排序若复用 `drag-list.tsx` 成本过高则先用上移/下移按钮
- [x] `setting.tsx` 编辑表单：复用 `SimpleForm`；`insertTo.type` 切换时字段联动；block 模式 `notebook` 仅当 `anchorId` 含 `${todayDailynoteId}` 时显示/必填
- [x] `setting.tsx` “插入今日日记”快捷按钮（a-flat）：一键填充 `insertTo={type:block,anchorId:'${todayDailynoteId}',mode:append,notebook:<选中>}` + 询问 notebook
- [x] `setting.tsx` block anchorId 获取 UX：粘贴块 ID 输入框 + `getBlockByID` 校验显示块内容预览（UX-1 MVP 方案）
- [x] `src/func/quick-input/index.ts` `declareSettingPanel = [{key:'QuickInput',title:'💡 QuickInput',element: QuickInputSetting}]`
- [x] CRUD 操作经 `config.ts` `saveTemplates` 持久化
**Verification**:
- Agent: `pnpm run type-check` 通过
- Agent: `pnpm run build` 通过
- Agent: 静态检查 `declareSettingPanel` 导出、CRUD 调用 `saveTemplates`、删除/编辑不直接改原数组引用导致 SolidJS 不更新
**User Check**:
6. BC-4: 独立 Tab 预设 CRUD 全流程；insertTo 类型切换字段联动；快捷“插入今日日记”填充正确
7. BC-5: “✅ 启用功能”出现 💡 QuickInput 开关，关闭后 `Alt+I` 与菜单消失
8. 配置持久化：重启插件后 `quick-input.templates` 仍保留

### Feedback Tasks (→ [NNN-description](./revisions/NNN-description.md))
- [x] 修正 Verification 边界：Agent 不声明可操作 SiYuan runtime；runtime 行为全部进入 User Check / `reference/runtime-verification.md`

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 0 | 100% | ✅ |
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Phase 4 | 100% | ✅ |

**Recent**:
- 2026-06-24T23:18: 修正 Verification 边界，区分 Agent 可验证与 SiYuan runtime User Check
- 2026-06-25T00:55: Phase 0 完成；发现 mode 命名歧义并记录 revision 001（next/prev → before/after）；runtime 行为验证转入 User Check
- 2026-06-25T01:05: Phase 1 types.ts 完成
- 2026-06-25T01:07: Phase 1 config.ts 完成（独立 Tab CRUD 可主动写 custom-module.config.json）
- 2026-06-25T01:08: Phase 1 index.ts skeleton 与 func/index.ts 注册完成；`pnpm run type-check` + `pnpm run build` 通过
- 2026-06-25T01:18: Phase 2 engine.ts 完成；`pnpm run type-check` + `pnpm run build` 通过；纯渲染临时断言通过
- 2026-06-25T01:23: Phase 3 panel.tsx 完成
- 2026-06-25T01:25: Phase 3 index.ts 快捷键/菜单接线完成；`pnpm run type-check` + `pnpm run build` 通过
- 2026-06-25T01:33: Phase 4 setting.tsx + declareSettingPanel 完成；`pnpm run type-check` + `pnpm run build` 通过；所有实现任务完成
- 2026-06-25T01:38: 补充 panel/setting 异步错误处理；最终 `pnpm run type-check` + `pnpm run build` 通过
