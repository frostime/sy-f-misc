# GPT 聊天历史记录重构文档

## 重构背景

随着 GPT 聊天历史记录的增多，用户在打开历史记录列表时遇到了性能问题：

1. **延迟问题**：需要逐个读取每个 JSON 文件，导致打开历史记录列表时有明显延迟
2. **流量消耗**：每次都需要加载完整的历史记录数据，包括所有消息内容
3. **内存占用**：大量完整历史记录同时加载到内存中

## 重构目标

将历史记录加载方式从"全量读取每个 JSON 文件"优化为"只读取一个 snapshot 文件"，同时在 UI 层区分两种数据类型：

- **Snapshot（permanent/归档）**：快照数据，只包含预览信息，用于快速列表显示
- **History（temporary/缓存）**：完整历史记录，包含所有消息内容

## 核心设计

### 1. 类型系统重构

**原有类型**：
- `IChatSessionHistory`：完整的聊天会话历史记录

**新增类型**：
- `IChatSessionSnapshot`：聊天会话快照数据
- `IHistorySnapshot`：历史记录快照文件结构

**类型标识**：
- `IChatSessionHistory.type = 'history'`
- `IChatSessionSnapshot.type = 'snapshot'`

### 2. 数据结构对比

| 字段 | IChatSessionHistory | IChatSessionSnapshot |
|------|-------------------|---------------------|
| id | ✓ | ✓ |
| title | ✓ | ✓ |
| timestamp | ✓ | ✓ |
| updated | ✓ | ✓ |
| tags | ✓ | ✓ |
| type | 'history' | 'snapshot' |
| items | ✓ (完整消息列表) | ✗ |
| sysPrompt | ✓ | ✗ |
| preview | ✗ | ✓ (前500字预览) |
| messageCount | ✗ | ✓ (消息数量) |
| lastMessageAuthor | ✗ | ✓ (最后消息作者) |
| lastMessageTime | ✗ | ✓ (最后消息时间) |
| systemPrompt | ✗ | ✓ (系统提示，用于搜索) |

### 3. 快照文件架构

**IHistorySnapshot**：
```typescript
interface IHistorySnapshot {
    schema: string; // 替代 version，标识数据结构版本
    lastUpdated: number; // 最后更新时间
    sessions: IChatSessionSnapshot[]; // 会话快照数组
}
```

**常量**：
```typescript
const SNAPSHOT_SCHEMA = '1.0.0'; // 替代 SNAPSHOT_VERSION
```

## 主要修改

### 1. types.ts
- 新增 `IChatSessionSnapshot` 接口，带 `type: 'snapshot'` 标识
- 为 `IChatSessionHistory` 添加 `type: 'history'` 标识
- 修改 `IHistorySnapshot.version` → `IHistorySnapshot.schema`

### 2. json-files.ts
- `SNAPSHOT_VERSION` → `SNAPSHOT_SCHEMA`
- `generateSessionSnapshot` 返回带 `type: 'snapshot'` 的数据
- `listFromJsonSnapshot` 直接返回 `IChatSessionSnapshot[]`，不再伪装成 `IChatSessionHistory`
- 保留 `listFromJsonFull` 返回完整的 `IChatSessionHistory[]`
- 新增 `updateSnapshotSession` 函数，直接更新快照中的会话记录
- 所有 snapshot 相关函数适配新的类型系统

### 3. local-storage.ts
- `saveToLocalStorage`、`listFromLocalStorage` 确保数据带有 `type: 'history'` 标识

### 4. persistence/index.ts
- 导出新的 snapshot 相关函数：`listFromJsonSnapshot`、`listFromJsonFull`、`updateSnapshotSession`

### 5. HistoryList.tsx
- 定义联合类型：`type HistoryItem = IChatSessionHistory | IChatSessionSnapshot`
- `fetchHistory` 根据 `sourceType` 分别调用不同的加载函数
- 所有 UI 逻辑适配联合类型，通过 `type` 字段区分处理
- `contentShotCut` 函数根据类型选择不同的预览逻辑
- `onclick` 函数只允许 `type: 'history'` 的记录进入聊天
- 编辑和保存功能根据数据源类型分别处理

## 关键实现细节

### 1. 类型安全的分支处理
```typescript
// 根据 sourceType 确定数据类型
if (sourceType() === 'temporary') {
    // 确保类型为 IChatSessionHistory
    persist.saveToLocalStorage(item as IChatSessionHistory);
} else {
    // 确保类型为 IChatSessionSnapshot
    persist.updateSnapshotSession(item as IChatSessionSnapshot);
}
```

### 2. 联合类型的内容处理
```typescript
const contentShotCut = (history: HistoryItem) => {
    if (history.type === 'snapshot') {
        return history.preview; // 直接使用预览
    } else {
        // 原有的完整处理逻辑
        return generatePreviewFromItems(history.items);
    }
}
```

### 3. UI 模式对应关系
- `sourceType: 'temporary'` → 加载 `IChatSessionHistory[]`（完整记录）
- `sourceType: 'permanent'` → 加载 `IChatSessionSnapshot[]`（快照记录）

## 兼容性处理

### 1. 向后兼容
- 保留 `listFromJsonLegacy` 函数处理旧版本快照文件
- 维护 `rebuildSnapshot` 函数，可以从完整历史记录重建快照
- 保留 `listFromJsonFull` 函数，提供完整历史记录的加载方式

### 2. 无感迁移
- 新旧数据格式可以共存
- 现有的 JSON 文件不需要修改
- 快照文件会在需要时自动生成和更新

## 性能优化效果

### 1. 加载速度
- **原方案**：读取 N 个 JSON 文件，每个文件包含完整消息历史
- **新方案**：只读取 1 个 snapshot 文件，包含所有会话的精简信息

### 2. 内存占用
- **原方案**：加载所有完整历史记录到内存
- **新方案**：只加载必要的预览信息，内存占用大幅减少

### 3. 网络流量
- **原方案**：传输完整的历史记录数据
- **新方案**：只传输精简的快照数据

## 使用指南

### 1. 数据源切换
用户可以在 UI 中选择：
- **缓存记录（temporary）**：显示完整的历史记录，支持直接进入聊天
- **归档记录（permanent）**：显示快照记录，加载快速，但不能直接进入聊天

### 2. 开发者接口
```typescript
// 加载快照（推荐用于列表显示）
const snapshots = await persist.listFromJsonSnapshot();

// 加载完整历史记录（用于需要完整数据的场景）
const fullHistories = await persist.listFromJsonFull();

// 更新快照中的会话
await persist.updateSnapshotSession(sessionSnapshot);
```

## 注意事项

1. **类型检查**：在处理 `HistoryItem` 时，务必通过 `type` 字段判断数据类型
2. **数据完整性**：快照数据不包含完整的消息内容，需要完整数据时应使用 `listFromJsonFull`
3. **更新同步**：修改历史记录时，需要同时更新对应的快照数据
4. **向后兼容**：确保新代码能够处理旧版本的数据格式

## 后续优化空间

1. **延迟加载**：在用户需要时才加载完整的历史记录
2. **缓存策略**：智能缓存常用的完整历史记录
3. **增量更新**：只更新变化的部分而非重写整个快照文件
4. **压缩存储**：对快照数据进行压缩以进一步减少存储空间

## 修改文件清单

- `src/func/gpt/types.ts`
- `src/func/gpt/persistence/json-files.ts`
- `src/func/gpt/persistence/local-storage.ts`
- `src/func/gpt/persistence/index.ts`
- `src/func/gpt/chat/HistoryList.tsx`

此重构实现了历史记录加载的性能优化，同时保持了类型安全和向后兼容性。
