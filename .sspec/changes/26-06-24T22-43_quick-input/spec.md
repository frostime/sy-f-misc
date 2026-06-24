---
name: quick-input
status: REVIEW
change-type: single
created: 2026-06-24T22:43:38
reference:
  - source: ".sspec/requests/26-06-18T01-18_quick-input.md"
    type: "request"
  - source: ".sspec/changes/26-06-24T22-43_quick-input/reference/input-template-type-draft.d.ts"
    type: "doc"
    note: "用户初版类型草案；本 change 对其做了收敛与简化（见 design.md 收敛对照表）。"
---

# quick-input

## Problem Statement

用户有多个重复性"插入入口"（在特定目录建 Issue 文档、往特定 heading 追加工作日志、闪念记录到今日日记…），每次都要手动翻阅导航定位插入点，造成持续的低强度摩擦。需要一个**可配置的预设面板**：全局快捷键 `Alt+I` 呼出 → 点击预设 → 可选填几个字段 → 自动在正确位置创建/插入正确内容并打开编辑，实现无压输入闭环。

## Proposed Solution

### Approach

新建独立 func module `src/func/quick-input/`，提供"可配置预设 → 一键插入"能力。核心是**一个数据驱动的深引擎 `executeTemplate(template, userInput)`**：把"在哪里插、插什么、插完是否打开"全部编码为一条预设数据（`QuickInputTemplate`），引擎内部串起 var 解析 → `${var}` 渲染 → 解析插入目标 → 调用内核 API → openBlock 的完整管线。

为什么是数据驱动单引擎而非策略/注册表模式：MVP 只有 2 类插入目标（document/block）和 2 类 var 来源（时间、今日日记）。单引擎内一个 `switch(insertTo.type)` + 一个扁平 `Record<string, () => Promise<any>>` var 字典已覆盖，且为后继扩展留最小缝——加 pre/post 脚本 = 字典加 entry + schema 加可选字段；加 SQL/JS anchorGenerator = switch 加一个 case。策略/注册表会为同一扩展点建两套等价抽象，MVP 阶段是负收益（shallow over-decomposition）。详见 [design.md](./design.md) Option 选型。

模板支持 kramdown 内联属性列表 `{: custom-x="y"}`，模板自带块属性 = 覆盖了草案 `postExecuteScript` 最常见用途，故 post-script 干净 defer。

### Behavior Contract

**BC-1 触发面板**
- Surface: 全局快捷键 + 顶栏菜单
- Before: 不存在
- After: `Alt+I`（与现有 `Shift+Alt+G` 不冲突）呼出 SolidJS Dialog，按 `group` 分组列出所有预设按钮；无预设时显示空态提示
- Boundary: 不影响 quick-draft（`Shift+Alt+G`）任何行为

**BC-2 预设执行（document）**
- Surface: 思源文档树 + 编辑器
- Before: 不存在
- After: 点击预设 → 若有 `declaredInputVar` 先弹 `SimpleForm` 填值（取消则中止）→ 渲染 `hpath` 与 `template` → `createDocWithMd` 在目标 notebook 创建文档（hpath 中不存在的父路径由内核创建）→ `openBlock` 默认打开新文档
- Boundary: 同 hpath 文档已存在时的行为由内核 `createDocWithMd` 决定（Design 阶段验证）；模板中 IAL `custom-*` 被内核解析为块属性（Design 阶段最小用例验证）

**BC-3 预设执行（block）**
- Surface: 思源编辑器
- Before: 不存在
- After: 点击预设 → 可选 `SimpleForm` → 解析 `anchorId`（支持 `${var}`，如 `${todayDailynoteId}`）→ 渲染 template → 按 `mode`（append/prepend/next/prev；revision 001 改为 append/prepend/before/after）调用 `appendBlock`/`prependBlock`/`insertBlock` → `openBlock` 默认打开定位到新块
- Boundary: `anchorId` 解析失败（块不存在）→ `showMessage` 报错并中止；IAL 同 BC-2

**BC-4 配置管理**
- Surface: 设置面板独立 Tab
- Before: 不存在
- After: 设置面板新增独立 Tab（参考 GPT/Toggl `declareSettingPanel` 模式），提供预设列表 CRUD：新增/编辑/删除/排序；编辑表单复用 `SimpleForm`；`insertTo` 类型切换时表单字段联动
- Boundary: 持久化到 `custom-module.config.json` 的 `quick-input` key；不影响其他模块配置

**BC-5 模块开关**
- Surface: 设置面板"✅ 启用功能"Tab
- Before: 不存在
- After: 新增 `💡 QuickInput` 开关，`declareToggleEnabled`，默认关闭；关闭时卸载快捷键与菜单

### Implementation Changes

- **feat(module): 注册 quick-input func module** `src/func/index.ts` 加入 `_ModulesToEnable`；新建 `src/func/quick-input/index.ts`（`name/enabled/load/unload/declareToggleEnabled/declareSettingPanel`，注册 `Alt+I` command + 顶栏菜单）
- **feat(types): 定义 QuickInputTemplate schema** `src/func/quick-input/types.ts`，`insertTo` 为 discriminated union（document|block），预留 `preExecuteScript`/`postExecuteScript`/`anchorGenerator` 可选字段位但不接线
- **feat(engine): 实现 executeTemplate 管线** `src/func/quick-input/engine.ts`，单深模块：var 解析（时间 + `todayDailynoteId` 内置 var 字典）→ `${var}` 手写插值渲染 → resolve target → `createDocWithMd`/`appendBlock`/`prependBlock`/`insertBlock` → `openBlock`
- **feat(ui): Alt+I 触发面板** `src/func/quick-input/panel.tsx`，`solidDialog` 渲染按 group 分组按钮 → 选中预设 → 有 `declaredInputVar` 则 `simpleFormDialog` → 调 `executeTemplate`
- **feat(ui): 设置面板模板 CRUD** `src/func/quick-input/setting.tsx`，`declareSettingPanel` 独立 Tab，预设列表 + `SimpleForm` 编辑；block anchorId 获取 UX（粘贴块 ID / 内置 picker）在 Design 落地
- **feat(config): 持久化** `src/func/quick-input/config.ts`，`declareModuleConfig`（key=`quick-input`）load/dump 预设列表到 `custom-module.config.json`

### Scope Summary

| File | Change | Effort |
|------|--------|--------|
| `src/func/quick-input/index.ts` | 新建：模块注册、快捷键、菜单 | S |
| `src/func/quick-input/types.ts` | 新建：schema + deferred 字段位 | S |
| `src/func/quick-input/engine.ts` | 新建：executeTemplate 深引擎管线 | M |
| `src/func/quick-input/panel.tsx` | 新建：Alt+I 触发面板 | S |
| `src/func/quick-input/setting.tsx` | 新建：模板 CRUD 设置 Tab | M |
| `src/func/quick-input/config.ts` | 新建：declareModuleConfig 持久化 | S |
| `src/func/index.ts` | 注册新模块 | XS |

**What Stays Unchanged**: quick-draft 模块（任何文件）；其他所有 func module；`SimpleForm`/`solidDialog`/`simpleFormDialog` 复用不改。

**Deferred（显式留扩展缝，本 change 不实现）**: `preExecuteScript`/`postExecuteScript`、SQL/JS `anchorGenerator`、Squirrelly 条件/循环模板、光标处插入。schema 字段位置预留，引擎不接线。

### Design Reference

See [design.md](./design.md) —— Option 选型、schema 收敛对照、管线数据流、接口契约、YAGNI ledger、风险与验证。
