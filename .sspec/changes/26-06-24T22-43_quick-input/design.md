---
change: "quick-input"
created: 2026-06-24T22:48:44
---

# Design: quick-input

## 1. 架构选型（Option A — 文件分解 + 单深引擎）

三个候选对比（详 Clarify/Design 磋商记录）：

| Option | 本质 | 应对 evolvability | 风险 | 取舍 |
|---|---|---|---|---|
| **A 选中** | 文件分解 + 单深引擎 `executeTemplate` + switch 派发 + 扁平 var 字典 | 加脚本/SQL = 加字典 entry + switch case，局部 | switch/字典后继可能膨胀 | 最小缝、深模块 |
| B | InsertTargetStrategy/VarResolver interface + registry | 理论最优，零改现有 | 2 类目标就上 3-4 interface → 浅模块群、信息泄漏 | 过度建模，YAGNI 否决 |
| C | 极简单文件 | 同 A | index.ts 承担生命周期+UI+CRUD，膨胀 | 文件边界缺失 |

**CRUD UI 选型**：独立 Tab `declareSettingPanel`（用户决定，参考 GPT/Toggl，便于后续扩展）。

## 2. 模块结构

```
src/func/quick-input/
├── index.ts      name/enabled/load/unload/declareToggleEnabled/declareSettingPanel
│                  addCommand(Alt+I) → openPanel(); registerMenuTopMenu
├── types.ts      QuickInputTemplate schema (insertTo discriminated union)
├── engine.ts     executeTemplate(tpl, userInput): Promise<{blockId}>  ← 深模块
│                  ├── resolveCtx(tpl, userInput): 内置 var 字典 + 用户输入 → ctx
│                  ├── render(str, ctx): ${var} 手写插值
│                  └── resolveTarget + insert + openBlock
├── panel.tsx     openPanel(): solidDialog 列出预设(按 group) → simpleFormDialog(若需) → executeTemplate
├── setting.tsx   QuickInputSetting: 预设列表 CRUD + SimpleForm 编辑 (declareSettingPanel element)
└── config.ts     declareModuleConfig { key:'quick-input', load/dump 预设列表 }
```

依赖方向：`index.ts → panel.tsx → engine.ts → types.ts`; `setting.tsx → engine.ts`(预览/校验可选) → `types.ts`; `config.ts → types.ts`。`engine.ts` 不依赖 UI。

## 3. 数据模型（schema 收敛）

相对用户初版草案 `reference/input-template-type-draft.d.ts` 的收敛：

| 草案 | 本 change | 理由 |
|---|---|---|
| `InputPlace = block\|document\|dailynote` | `block\|document` | dailynote 是 block 的样板（`anchorId="${todayDailynoteId}"`） |
| `IBasicVar`/`IMidVar`/`ITemplateVar` 三层 | 单一 evolving `ctx: Record<string,any>` | 同一字典的过早分层 |
| `IDeclaredInputVar`（text/number/enum/bool） | 复用 `SimpleFormField` | 不重造表单规范 |
| `InsertToTemplate` 含 `anchorGenerator{type:'sql'\|'js'}` | `anchorId: string`（`${var}` 模板）+ deferred 字段位 | MVP 不上 SQL/JS |
| `pre/postExecuteScript` | schema 预留可选字段，引擎不接线 | deferred |
| `TemplateStorage`（templates+groups+settings） | `templates: QuickInputTemplate[]` + group 从模板字段聚合 | 不单独存 group 实体 |

### Schema 契约

```typescript
type InsertMode = 'append' | 'prepend' | 'next' | 'prev';

type InsertTo =
  | { type: 'document'; notebook: NotebookId; hpath: string }   // hpath 支持 ${var}
  | { type: 'block'; anchorId: string; mode: InsertMode; notebook?: NotebookId }; // anchorId 支持 ${var}; notebook 仅当 anchorId 引用 ${todayDailynoteId} 时必填

// 定界符 ${var}（非 {{var}}），避免与思源 kramdown 嵌入块 {{...}} 语法冲突

// declaredInputVar 复用 SimpleFormField（去掉 upload/slider/radio 等富类型，MVP 仅 text/textarea/number/checkbox/select）
type DeclaredVar = Pick<SimpleFormField, 'key' | 'label' | 'type' | 'value' | 'placeholder' | 'options' | 'min' | 'max' | 'step' | 'description'>;

interface QuickInputTemplate {
  id: string;
  name: string;
  icon?: string;
  group?: string;
  insertTo: InsertTo;
  template?: string;            // Markdown + kramdown IAL
  declaredInputVar?: DeclaredVar[];
  openBlock?: boolean;          // default true
  // ── deferred 字段位（schema 预留，引擎 MVP 不接线）──
  preExecuteScript?: string;
  postExecuteScript?: string;
  createdAt?: number;
  updatedAt?: number;
}

interface QuickInputConfig {            // custom-module.config.json → 'quick-input'
  templates: QuickInputTemplate[];
}
```

### 内置 var 字典（engine.ts 内，扁平 `Record<string, (ctx) => Promise<any>|any>`）

| key | 来源 |
|---|---|
| `year month day hour minute second date time datetime` | 本地时间 `Date` |
| `todayDailynoteId` | `createDailynote(notebook)` —— 模板引用时按 insertTo 上下文取 notebook：document 模式取 `insertTo.notebook`；block 模式取 `insertTo.notebook`（必填） |

> P-1 已定：block 模式 anchorId 引用 `${todayDailynoteId}` 时，`insertTo.notebook` 必填。日记样板由 setting UI 快捷填充（a-flat），不新增顶层字段。

## 4. 执行管线（行为规约）

```
用户点预设
  │
  ▼
[1] 有 declaredInputVar? ──是──► simpleFormDialog(fields) ──取消──► 中止
                                  └─确定──► userInput: Record<string,any>
  │ 否
  ▼
[2] resolveCtx(tpl, userInput)
      内置 var 字典求值（lazy：仅解析模板实际引用的 var）
      ⊕ userInput
      ⇒ ctx
  │
  ▼
[3] 按 insertTo.type 解析目标
      document: hpath' = render(insertTo.hpath, ctx)
                docId = await createDocWithMd(notebook, hpath', render(template, ctx))
      block:    anchorId' = render(insertTo.anchorId, ctx)   // 若引用 ${todayDailynoteId}，先由 ctx 中的内置 var 解析
                md = render(template, ctx)
                mode=append  → appendBlock('markdown', md, anchorId')
                mode=prepend → prependBlock('markdown', md, anchorId')
                mode=before  → insertBlock('markdown', md, nextID=anchorId')
                mode=after   → insertBlock('markdown', md, undefined, previousID=anchorId')
  │
  ▼
[4] openBlock?.(docId|newBlockId)  (openBlock 默认 true)
  │
  ▼
done → 返回 {blockId}
```

**mode 映射到内核 API**（`@frostime/siyuan-plugin-kits/api`）：

| mode | API | 备注 |
|---|---|---|
| append | `appendBlock('markdown', md, parentID=anchorId')` | 作为 anchor 末尾子块 |
| prepend | `prependBlock('markdown', md, parentID=anchorId')` | 作为 anchor 首个子块 |
| before | `insertBlock('markdown', md, nextID=anchorId')` | anchor 的前一个兄弟 |
| after | `insertBlock('markdown', md, undefined, previousID=anchorId')` | anchor 的后一个兄弟 |

> `insertBlock(dataType, data, nextID?, previousID?, parentID?)` 签名已确认（见 `api.d.ts:35`）。before 传 `nextID`，after 传 `previousID`，不传 parentID。

## 5. 接口契约（关键签名）

```typescript
// engine.ts —— 深模块，唯一对外接口
export async function executeTemplate(
  tpl: QuickInputTemplate,
  userInput: Record<string, any>
): Promise<{ blockId: string }>;

// 内部（不导出，MVP）
async function resolveCtx(tpl, userInput): Promise<Record<string, any>>;
function render(str: string, ctx: Record<string, any>): string;  // ${var} 插值，未定义 key → 空串

// panel.tsx
export function openPanel(): Promise<void>;  // solidDialog 内部自管生命周期

// config.ts
export const declareModuleConfig: IFuncModule['declareModuleConfig'];
export function getTemplates(): QuickInputTemplate[];   // panel/setting 读取
export function saveTemplates(list: QuickInputTemplate[]): void;

// setting.tsx
export default function QuickInputSetting(): JSX.Element;  // declareSettingPanel element
```

`render` 语义：定界符 `${var}`，正则 `/\$\{(\w+)\}/g` → `ctx[var] ?? ''`；不支持嵌套/条件/循环（deferred 到 Squirrelly）；字面量 `\${abc}` 先反转义还原。**不用 `{{var}}`**——与思源 kramdown 嵌入块 `{{...}}` 语法冲突。

## 6. IAL 与块属性（待验证假设 V-1）

模板示例：
```markdown
标题: ${title}
状态: 准备中
{: custom-status="准备中" custom-type="${type}"}
```

`${type}` 在 IAL 内由 `render` 先插值，再整体交给内核。**假设**：内核 `createDocWithMd`/`appendBlock` 解析 IAL 并把 `custom-*` 挂到对应块。约束：模板 IAL **只写 `custom-*`，不写死 `id`**（块 id 冲突）。Design 阶段（Plan 前）写最小用例验证：`appendBlock('markdown', 'xxx\n{: custom-test="1"}', someDocId)` 后 `getBlockAttrs(newBlockId)` 应见 `custom-test=1`。

## 7. 待定子决策 / 风险

| ID | 项 | 状态 |
|---|---|---|
| P-1 ✅ | block 模式 anchorId 引用 `${todayDailynoteId}` 时 notebook 来源 | 已定 (a-flat)：`insertTo.block.notebook?` 可选字段，引用时必填；日记样板由 setting UI 快捷填充 |
| V-1 | 内核 IAL 解析为块属性 | 假设，Plan/Implement 首任务最小用例验证 |
| V-2 | `createDocWithMd` 对 hpath 中不存在父路径的创建行为 | 假设：内核自动创建中间文档；Plan 前验证 |
| V-3 | `createDocWithMd` 同 hpath 已存在时的行为 | 假设：创建同名新文档（内核可能追加后缀）；Plan 前验证 |
| UX-1 | block anchorId 在 setting.tsx 的获取 UX | 候选：粘贴块 ID 输入框（MVP）/ 内置 block picker（后续）。MVP 用粘贴 + `getBlockByID` 校验 |

## 8. YAGNI Ledger

**本次不建**：
- `InsertTargetStrategy` / `VarResolver` interface + registry → 信号：第三种 insert 类型或脚本 var 出现且 switch/字典开始失控
- `pre/postExecuteScript` 执行器、沙箱、错误 UX → 信号：用户提出动态计算 var 的真实场景且内置 var 字典不够
- SQL/JS `anchorGenerator` → 信号：动态选位置需求超出 `${var}` 模板化 anchorId
- Squirrelly 条件/循环模板 → 信号：模板需要逻辑分支
- 光标处插入 → 信号：用户明确提出
- 模板分组管理 UI（group 实体）→ group 从模板字段聚合即可

## 9. 复用清单

| 复用 | 来源 |
|---|---|
| `SimpleForm` / `SimpleFormField` | `src/libs/components/simple-form.tsx` |
| `solidDialog({title, loader})` | `src/libs/dialog.ts` |
| `simpleFormDialog({fields}) → Promise<{ok,values}>` | `src/libs/dialog.ts` |
| `createDocWithMd`/`appendBlock`/`prependBlock`/`insertBlock`/`openBlock`/`createDailynote`/`getBlockByID` | `@frostime/siyuan-plugin-kits` |
| `declareSettingPanel` 独立 Tab 模式 | `src/func/gpt/index.ts`、`src/func/toggl/index.ts` |
| `declareModuleConfig` load/dump 模式 | `func-module-architecture` spec-doc 写法 1 |
| `addCommand` + `registerMenuTopMenu` | `src/func/quick-draft/index.ts` 模式 |
