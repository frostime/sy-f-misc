---
name: gpt-cache-split
status: DOING
change-type: single
created: 2026-06-12 22:35:51
reference:
- source: .sspec/requests/26-06-12T21-32_gpt-chat-cache-issue.md
  type: request
  note: Linked from request
- source: .sspec/changes/26-06-12T22-35_gpt-cache-split/revisions/001-harden-migration-edge-cases.md
  type: revision
  note: Harden directory status, path-safe cache ids, and partial migration retry semantics
---

# gpt-cache-split

## Problem Statement

`gpt-chat-cache.json` 单文件 68MB，每次 module load/unload 全量重写。思源同步为每次变更创建 history 快照，时间一长积累 10+ GB。

## Proposed Solution

### Approach

将单一 `gpt-chat-cache.json` 拆分为 `gpt-cache/{session-id}.json` 多文件存储。

- **增量写**：每次 `saveToLocalStorage` 时，同步将该 session 写入对应的单独 cache 文件（~2MB），替代当前"unload 时 dump 全部 36 sessions 到一个 68MB 文件"的模式。
- **Unload 兜底**：`updateCacheFile` 变为全量同步 + 清理操作（确保 localStorage 中的所有 session 都已持久化，同时 evict 超出 KEEP_N 的旧文件）。
- **恢复不变**：`restoreCache` 改为读取 `gpt-cache/` 目录下所有文件，并行加载。
- **迁移**：首次 `restoreCache` 检测旧 `gpt-chat-cache.json` → 拆分 → 保留旧文件不删除。

Why this over alternatives:
- 与 `json-files.ts` 的 per-session 归档模式一致，已验证可行
- 不改变调用方接口（`saveToLocalStorage` / `restoreCache` / `updateCacheFile` 签名不变）
- 增量写将单次同步写入量从 68MB 降低到 ~2MB，根本解决同步压力

### Key Change

**Refactor A: Per-session cache file I/O**
- `updateCacheFile` → 遍历 localStorage，per-file 写入 `gpt-cache/{id}.json`，evict 超出 KEEP_N 的最旧文件
- `restoreCache` → `readDir('gpt-cache/')` + `Promise.all` 并行读取 → 还原到 localStorage
- `saveToLocalStorage` → 原有 localStorage 写入 + 同步写入 `gpt-cache/{id}.json`
- `removeFromLocalStorage` → 原有 localStorage 删除 + 删除对应 cache 文件

**Migration B: 自动迁移旧文件**
- 在 `restoreCache` 中检测 `gpt-chat-cache.json` 是否存在
- 存在则解析、拆分写入 `gpt-cache/` 各个文件
- 旧文件保留不删除（用户可手动清理）

### Scope Summary

| File | Change |
|------|--------|
| `src/func/gpt/persistence/local-storage.ts` | 重写全部导出函数，新增迁移逻辑 |

### Design Reference

→ See [design.md](./design.md)
