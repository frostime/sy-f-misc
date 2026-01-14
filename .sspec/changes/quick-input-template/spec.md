---
status: REVIEW
type: "feature"
created: 2026-01-09T16:51:41
updated: 2026-01-09T20:30:00
pivot: "2026-01-09 - UI方案从SolidJS改为HSPA"
---

# Quick Input Template (快速输入模板)

## 🔄 PIVOT HISTORY

**2026-01-09 20:00 - UI Implementation Pivot**

**原方案**: SolidJS 组件（QuickInputDialog.tsx）
**问题**:
1. UI 显示效果不佳
2. 模板功能故障（executor.ts 逻辑错误）
3. 缺少配置管理界面

**新方案**: HSPA (HTML Single Page Application)
- quick-input-dialog.html - 快速输入对话框
- template-editor.html - 模板管理编辑器
- 通过 openIframeDialog 打开，使用 customSdk 传递数据

**优势**:
- 原生 HTML/CSS，无组件渲染问题
- 更好的交互体验
- 减少 bundle 体积
- 易于维护和调试

---

## A. Proposal and Problem Statement

### Current Situation

用户在思源笔记中频繁需要在特定位置插入结构化内容，但现有方式效率低下：
- **手动定位困难**：需要手动翻阅找到目标位置（如今日日记、特定文档、某个标题块）
- **重复性工作**：相同类型的内容需要重复输入相似的模板结构
- **缺乏自动化**：无法预定义变量、自动计算值、执行前后置脚本

### User Request / Requirement

参考 `.sspec/requests/260109005751-quick-input-template.md`

**核心需求**：
1. 创建新的 func module，提供快速输入模板功能
2. 支持在不同位置插入内容：block、document、dailynote
3. 支持用户输入变量（通过 simple-form）
4. 支持前后置脚本执行
5. 支持模板渲染（使用 Squirrelly 模板引擎）
6. 提供 HSPA 配置页面管理模板
7. 注册快捷键 `Alt+I` 快速唤起

**典型场景**：
- 场景 1：在 `/开发ISSUE/` 创建带日期的新文档，包含预定义字段
- 场景 2：在汇总文档的标题块下追加月度统计（通过 SQL 定位 + 脚本计算）
- 场景 3：在今日日记末尾追加固定格式内容

## B. Proposed Solution

### Framework of Idea

**核心架构**：模板配置系统 + 执行引擎 + UI 组件

```
Template Store (配置存储)
    ↓
Quick Input Dialog (快速选择)
    ↓
Template Executor (执行引擎)
    ├─ 收集用户输入 (simple-form)
    ├─ 计算插入位置 (SQL/JS 检索)
    ├─ 执行前置脚本 (动态变量)
    ├─ 渲染模板内容 (Squirrelly)
    ├─ 调用内核 API (插入块/文档)
    ├─ 执行后置脚本
    └─ 打开编辑位置 (可选)
```

**数据模型**（遵循 request 规范）：
```typescript
INewInputTemplate<T extends InputPlace>
    ├─ name, desc, icon (基本信息)
    ├─ newtype: 'block' | 'document' | 'dailynote'
    ├─ insertTo: InsertToTemplate[T] (位置模板)
    ├─ template: string (Markdown 模板)
    ├─ declaredInputVar (用户输入变量定义)
    ├─ preExecuteScript (前置脚本)
    ├─ postExecuteScript (后置脚本)
    └─ openBlock: boolean (是否打开编辑)

变量上下文流转：
IBasicVar (基础时间变量)
    → IMidVar (+ 用户输入)
    → ITemplateVar (+ root, anchor)
```

### Key Changes

**新增模块**：`src/func/quick-input-template/`
```
├── index.ts                    # IFuncModule 入口
├── types.ts                    # TypeScript 类型定义
├── template-store.ts           # 模板配置存储
├── executor.ts                 # 模板执行引擎
├── components/
│   ├── QuickInputDialog.tsx    # 快速输入对话框
│   ├── TemplateEditor.tsx      # 模板编辑器
│   └── TemplateList.tsx        # 模板列表
```

**复用资源**：
- `simple-form.tsx`：用户输入表单
- `solidDialog`：对话框封装
- `@external/squirrelly`：模板引擎（动态导入）
- `@/api`：insertBlock, appendBlock, createDocWithMd, sql 等

**快捷键**：
- `Alt+I`：唤起快速输入对话框

## C. Implementation Strategy

### Phase 1: Core Infrastructure (核心基础)

1. **类型定义** (`types.ts`)
   - 定义完整 TypeScript 类型系统（INewInputTemplate 等）
   - 确保类型安全

2. **模板存储** (`template-store.ts`)
   - 实现 TemplateStore 类（CRUD + 持久化）
   - 数据存储在 plugin data (`quick-input-templates`)

3. **基础 UI 组件**
   - `QuickInputDialog.tsx`：简单按钮列表
   - 先实现最小可用版本

### Phase 2: Execution Engine (执行引擎)

4. **模板执行器** (`executor.ts`)
   - 实现 `TemplateExecutor` 类
   - 关键函数：
     - `resolveInsertToAnchor`: 计算插入位置
     - `renderTemplate`: Squirrelly 模板渲染
     - `executeScript`: 沙箱化脚本执行
     - `insertContent`: 调用内核 API 插入

5. **快捷键注册**
   - 在 `index.ts` 中注册 `Alt+I`
   - 连接 Dialog → Executor

### Phase 3: Advanced Features (高级功能)

6. **模板编辑器** (`TemplateEditor.tsx`)
   - 复杂表单编辑（分步骤、分区块）
   - 支持所有配置项编辑

7. **配置页面集成**
   - 使用 `declareSettingPanel` 注册配置面板
   - 展示模板列表、支持添加/编辑/删除

### Phase 4: Polish & Testing (完善与测试)

8. **错误处理与验证**
   - 清晰的错误提示
   - 输入验证

9. **示例模板**
   - 提供 2-3 个预设模板
   - 覆盖典型使用场景

10. **文档与测试**
    - 编写用户文档
    - 测试两个典型场景

### Implementation Details

**模板渲染核心逻辑**：
```typescript
async function renderTemplate(template: string, vars: Record<string, any>) {
    const Sqrl = await import('@external/squirrelly');
    return Sqrl.render(template, vars);
}
```

**插入位置计算**：
- `block` 类型：执行 SQL/JS → 获取 anchor block → 根据 `anchorUsage` 决定 prepend/append/insert
- `document` 类型：渲染 hpath 模板 → 查找或创建文档
- `dailynote` 类型：调用 `createDailynote` API → prepend/append

**脚本执行安全**：
```typescript
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const fn = new AsyncFunction('ctx', script);
return await fn(ctx);
```

## D. Blockers & Feedback

### Confirmed Technical Decisions

**已确认**（User Feedback）:

1. **模板导入/导出功能**：✅ 需要实现
   - 参考 `src/func/gpt/model/storage.ts` 方案
   - 在 module 的 `load` 中使用 `plugin.loadData` 和 `plugin.saveData`
   - 支持导出为 JSON 文件，导入模板配置

2. **模板分组机制**：✅ 实现
   - 添加 `group` 字段到 `INewInputTemplate`
   - UI 中支持按分组展示
   - Tags 功能暂不实现

3. **快捷键处理**：✅ 无冲突
   - `Alt+I` 不会与现有快捷键冲突
   - 直接注册即可

4. **模板引擎**：✅ 假定 Squirrelly 正常工作
   - Template 是用户输入，引擎无需关心细节
   - 专注于集成和错误处理

5. **脚本安全性**：✅ 用户自行负责
   - Script 是用户自己输入，由用户对自己的代码负责
   - 保留基本沙箱机制（AsyncFunction）即可

6. **模板编辑器实现**：✅ 可选用 HTML-Page/HSPA
   - 如果 SolidJS 实现复杂，可以使用 HSPA 方案
   - 参考 `.sspec/skills/html-page.md`
   - 独立 HTML 页面可能更灵活

### Implementation Refinements

**TemplateEditor 实现方案调整**：
- **方案 A（优先）**：使用 HSPA 独立页面
  - 创建 `src/func/quick-input-template/editor-page.html`
  - 更灵活的 UI 布局和交互
  - 可以使用成熟的表单库（如 Bulma/Tailwind）

- **方案 B（备选）**：SolidJS 组件
  - 仅在 HSPA 不适用时考虑
  - 使用现有组件库（Form, simple-form）

**数据结构增强**：
```typescript
interface INewInputTemplate<T extends InputPlace> {
    // ... 原有字段

    // 新增字段
    id: string;           // 模板唯一标识
    group?: string;       // 分组名称
    createdAt: number;    // 创建时间戳
    updatedAt: number;    // 更新时间戳
}

interface TemplateGroup {
    name: string;
    icon?: string;
    order: number;
}
```

**存储架构**：
```typescript
// 参考 gpt/model/storage.ts
interface TemplateStorage {
    templates: Record<string, INewInputTemplate<any>>;
    groups: TemplateGroup[];
    settings: {
        defaultGroup?: string;
        showGroupsInDialog?: boolean;
    };
}

class TemplateStore {
    async load() {
        const data = await thisPlugin().loadData('quick-input-templates.json');
        // ...
    }

    async save() {
        await thisPlugin().saveData('quick-input-templates.json', this.storage);
    }

    async exportTemplate(id: string): Promise<Blob> {
        // 导出单个模板为 JSON
    }

    async importTemplate(file: File): Promise<void> {
        // 从 JSON 文件导入模板
    }
}
```

### No Active Blockers

当前无阻塞问题，可以进入实施阶段。

### Next Steps

1. ✅ 需求确认完成
2. ✅ 技术方案确认完成
3. **→ 进入 tasks.md 规划**：分解详细实施任务
4. **→ 进入 DOING 状态**：开始编码实现

