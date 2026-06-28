---
name: refactor-zotero
status: PLANNING
change-type: single
created: 2026-06-28 18:26:25
reference:
- source: .sspec/requests/26-06-28T18-08_refactor-zotero.md
  type: request
  note: Linked from request
---
<!-- MUST follow frontmatter schema:
status: PLANNING | DOING | REVIEW | DONE | BLOCKED
change-type: single | sub
reference?: Array<{source, type: 'request'|'root-change'|'sub-change'|'prev-change'|'doc'|'revision', note?}>

Sub-change MUST link root:
reference:
  - source: ".sspec/changes/<root-change-dir>"
    type: "root-change"
    note: "Phase <n>: <phase-name>"

Single-change common reference:
reference:
  - source: ".sspec/requests/<request-file>.md"
    type: "request"
  - source: ".sspec/changes/<change-dir>"
    type: "prev-change"
    note: "Follow-up to <change-name>."
-->

# refactor-zotero

## Problem Statement

**Current state**: 
- Zotero 模块依赖 Better BibTeX 的 `debug-bridge` 插件，需要配置访问 token
- 配置存储混乱：`zoteroPassword` 在旧的 `configs.json` (Misc) 组，`zoteroDir` 在独立文件 `zoteroDir.config.json`
- Zotero 缺少 `dump()` 方法，导致 `zoteroDir` 的单设备值被错误写入会跨设备同步的 `custom-module.config.json`
- 用户需要手动安装第三方插件并配置密码，增加使用门槛

**User need**: 
1. 移除对 Better BibTeX debug-bridge 的依赖，使用官方 Zotero Local API + 轻量级自研 bridge 扩展
2. 修复配置存储问题：`zoteroPassword` 迁移到 `custom-module.config.json`，`zoteroDir` 继续独立存储
3. 为新旧版本用户提供清晰的迁移指引和文档
4. 为未来的 bridge 扩展自动更新预留设计空间

## Proposed Solution

### Approach

**核心方案（方案 A：最小化 Bridge + 显式 dump）**：

1. **Transport 层重构**：
   - 数据访问：优先使用 Zotero Local API (`/api/users/0/*`)，未来可扩展（本次暂不使用，保持最小改动）
   - UI 状态访问：使用自研 bridge 扩展 (`/f-zotero-ext/api/v1/*`) 获取"当前选中项"
   - 健康检查：Local API `/api/` 或 Connector `/connector/ping`

2. **配置存储修复**（核心修复）：
   - **添加显式 `dump()` 方法**，只导出 `zoteroPassword`，排除 `zoteroDir`
   - `zoteroPassword` 迁移：从 `configs.json` (Misc.zoteroPassword) → `custom-module.config.json` (Zotero.zoteroPassword)
   - `zoteroDir` 保持独立：继续使用 `zoteroDir.config.json`，不写入 `custom-module.config.json`
   - 迁移逻辑在 `load()` 中：检测 `configs.json` 的 `Misc.zoteroPassword`，如存在则迁移
   - 旧配置保留但标记废弃，用于迁移检测

3. **迁移 UX**：
   - 首次调用 Zotero 功能时检测旧配置，弹窗提示迁移
   - 配置面板显示"检查连接"按钮，区分 Local API 和 Bridge 扩展的状态

4. **文档更新**：
   - 更新 `zotero-desc.md`：介绍新架构、快速开始指引
   - 新增 `zotero-migration.md`：详细迁移步骤、故障排查
   - 更新 `README.md`：移除 debug-bridge 相关描述，指向新文档

5. **Bridge 扩展分发**：
   - 将 `.xpi` 打包进插件 `dist/external/zotero-bridge/`
   - 文档中提供从 GitHub Release 或插件目录获取 `.xpi` 的两种方式

6. **预留更新机制**：
   - 本次不实现自动更新，保持 `manifest.json` 中的 `update_url` 占位符
   - 在 `memory.md` 和代码注释中标记待后续调研的自动更新方案

**为何此方案**：
- Bridge 扩展极简（仅获取选中项 key），降低维护成本
- Local API 是官方标准，比第三方 debug-bridge 更稳定
- **添加 `dump()` 是最小改动**：5行代码，不触碰核心设置系统，与 doc-context/insert-time 同模式
- `zoteroDir` 独立存储避免跨设备同步冲突
- 分阶段实现：先完成核心迁移，自动更新独立调研

### Behavior Contract

**BC-1: Zotero 功能行为保持不变**

- **Surface**: 思源插件 slash 命令 (`/cite`, `/note`)、粘贴处理、`globalThis.ZoteroSDK` API
- **Unchanged**: 
  - `/cite` 引用选中项：行为与旧版相同
  - `/note` 导入笔记：行为与旧版相同（包括引用、标注、图片解析）
  - Zotero 链接粘贴优化：行为与旧版相同
- **Changed**: 
  - `globalThis.ZoteroSDK.executeJSCode()` → **删除**（breaking change，但实际无人使用）
  - 不再需要配置 `zoteroPassword`
  - 需要安装新的 bridge 扩展

**BC-2: 配置迁移行为**

- **Surface**: 插件设置面板、`custom-module.config.json`、`zoteroDir.config.json`
- **Before**: 
  - `zoteroPassword` 在 `configs.json` 的 `Misc.zoteroPassword`（zombie，已注释）
  - `zoteroDir` 在独立文件 `zoteroDir.config.json`
  - ❌ **Bug**: `zoteroDir` 的单设备值被错误写入 `custom-module.config.json`（因缺少 `dump()`）
- **After**:
  - `zoteroPassword` 迁移到 `custom-module.config.json` (Zotero.zoteroPassword)
  - `zoteroDir` 继续在独立文件 `zoteroDir.config.json`（设备独立）
  - ✅ **Fix**: 添加 `dump()` 方法，排除 `zoteroDir`，只导出 `zoteroPassword`
  - 设置面板显示"Zotero"区域，包含 `zoteroDir` 和"检查连接"按钮
- **Migration**:
  - `declareModuleConfig.load()` 检测 `configs.json` 的 `Misc.zoteroPassword`
  - 如存在旧配置，自动迁移到 `custom-module.config.json`
  - 首次调用 Zotero 功能时，如果检测到旧配置且未提示用户，弹窗显示迁移指南
  - 旧配置保留在 `configs.json` 但标记废弃

**BC-3: 连接诊断行为**

- **Surface**: 设置面板"检查连接"按钮
- **After**: 点击后检测并区分显示：
  - ✅ Local API 和 Bridge 都正常
  - ⚠️ Local API 正常，Bridge 未安装 → 提示查看文档安装
  - ⚠️ Bridge 正常，Local API 未启用 → 提示启用 Local API
  - ❌ Zotero 未运行

**BC-4: 文档更新行为**

- **Surface**: `README.md`, `docs/zotero-*.md`
- **After**:
  - `README.md` 移除 debug-bridge 相关说明，增加"需安装 bridge 扩展"说明
  - `docs/zotero-desc.md` 更新为新架构介绍
  - `docs/zotero-migration.md` 新增迁移指南

### Implementation Changes

**refactor(zotero/transport): 替换 debug-bridge 为 bridge + Local API** (BC-1)
- 移除 `executeZoteroJS()` 和 `_callZoteroJS()` 方法
- 新增 `_getSelectedItemsFromBridge()` 调用 bridge `/selected`
- 新增 `_getItemChildren()` 调用 Local API `/api/users/0/items/{key}/children`
- 更新 `getItemNote()` 逻辑：先 bridge 获取 key，再 Local API 获取 children
- 更新 `checkZoteroRunning()` 逻辑：检查 Local API + Connector

**fix(zotero/config): 添加显式 dump() 修复双重写入** (BC-2, 核心修复)
- **添加 `dump()` 方法**，只导出 `zoteroPassword` 和 `_migrated`，排除 `zoteroDir`
- `declareModuleConfig.load()` 实现从 `configs.json` Misc 组的自动迁移
- `zoteroDir` 继续使用独立文件 `zoteroDir.config.json`
- 新增 `checkConnection` 按钮配置项

**feat(zotero/config): 增加连接诊断功能** (BC-3)
- 新增 `checkZoteroConnection()` 函数
- 新增 `showConnectionStatus()` 函数，区分显示 4 种状态

**feat(zotero/migration): 首次调用时提示迁移** (BC-2)
- `src/func/zotero/index.ts` 中新增 `checkAndShowMigrationDialog()`
- 在 `load()` 中调用，检测旧配置并弹窗
- 使用 `documentDialog` 显示 `zotero-migration.md`

**docs(zotero): 更新文档** (BC-4)
- 更新 `src/func/zotero/zotero-desc.md`
- 新增 `src/func/zotero/zotero-migration.md`
- 更新 `README.md` 中的 Zotero 部分

**chore(zotero/bridge): 确保 .xpi 打包和分发**
- 确认 `src/external/zotero-bridge/pack.sh` 可用
- 在构建流程中将 `.xpi` 复制到 `dist/external/zotero-bridge/`

**chore(zotero): 标记自动更新为待调研项** (预留)
- 在 `memory.md` 中记录自动更新需求
- 在 bridge `manifest.json` 注释中说明 `update_url` 当前为占位符

### Scope Summary

| File | Change | Effort |
|------|--------|--------|
| `src/func/zotero/zoteroModal.ts` | 重构 transport 层，移除 debug-bridge，新增 bridge + Local API 调用 | M |
| `src/func/zotero/config.ts` | **添加 `dump()` 方法**，调整 `load()` 迁移逻辑，增加连接诊断 | M |
| `src/func/zotero/index.ts` | 增加迁移提示逻辑，移除 `globalThis.ZoteroSDK.executeJSCode` | S |
| `src/func/zotero/js/*.js` | 删除（不再需要注入 JS 到 Zotero） | XS |
| `src/func/zotero/zotero-desc.md` | 更新为新架构文档 | S |
| `src/func/zotero/zotero-migration.md` | 新增迁移指南 | M |
| `README.md` | 更新 Zotero 部分 | S |
| `vite.config.ts` | 确保 `.xpi` 打包到 dist | S |

### Design Reference

See [design.md](./design.md) for technical architecture details.
