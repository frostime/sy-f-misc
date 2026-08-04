---
change: "refactor-zotero"
created: 2026-06-28T18:26:25
updated: 2026-06-28T19:15:00
---

# Design: refactor-zotero

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ 思源插件 (sy-f-misc)                                         │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ src/func/zotero/                                   │    │
│  │                                                    │    │
│  │  index.ts                                          │    │
│  │   ├─ load() → checkAndShowMigrationDialog()       │    │
│  │   ├─ /cite slash command                          │    │
│  │   ├─ /note slash command                          │    │
│  │   └─ paste processor                              │    │
│  │                                                    │    │
│  │  zoteroModal.ts (Transport Layer)                 │    │
│  │   ├─ getSelectedItems()                           │    │
│  │   ├─ getItemNote()                                │    │
│  │   └─ checkZoteroRunning()                         │    │
│  │                                                    │    │
│  │  config.ts (Configuration)                        │    │
│  │   └─ declareModuleConfig + dump()                 │    │
│  └────────────────────────────────────────────────────┘    │
│                      │                                      │
│                      │ HTTP Requests                        │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │ localhost:23119       │
           ├───────────────────────┤
           │                       │
           │  Zotero Desktop       │
           │                       │
           │  ┌─────────────────┐  │
           │  │ Local API       │  │ ← Official, read-only
           │  │ /api/users/0/*  │  │
           │  └─────────────────┘  │
           │                       │
           │  ┌─────────────────┐  │
           │  │ Connector       │  │ ← Official, ping/import
           │  │ /connector/*    │  │
           │  └─────────────────┘  │
           │                       │
           │  ┌─────────────────┐  │
           │  │ Bridge Extension│  │ ← Custom, UI state only
           │  │ /f-zotero-ext/  │  │
           │  │   /api/v1/*     │  │
           │  └─────────────────┘  │
           └───────────────────────┘
```

## Transport Layer Interfaces

### Before (debug-bridge)

```typescript
class ZoteroDBModal {
  // 通用执行器 - 将任意 JS 代码 POST 到 debug-bridge
  public async executeZoteroJS(code: string): Promise<any> {
    const password = getPassword();
    return fetch('http://127.0.0.1:23119/debug-bridge/execute', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${password}`, ... },
      body: code
    });
  }
  
  // 所有功能都通过注入 JS 实现
  private async _callZoteroJS(filename: string, prefix: string): Promise<any> {
    const jsContent = await readFile(`${jsPath}/${filename}.js`);
    return this.executeZoteroJS(prefix + "\n" + jsContent);
  }
  
  public async getSelectedItems() {
    return this._callZoteroJS('getSelectedItems', '');
  }
  
  public async getItemNote() {
    return this._callZoteroJS('getItemNote', '');
  }
  
  public async checkZoteroRunning() {
    return this._callZoteroJS('checkRunning', '');
  }
}
```

### After (bridge + Local API)

```typescript
class ZoteroDBModal {
  // ============ Public API ============
  
  public async getSelectedItems(): Promise<ISelectedItem[]> {
    const running = await this.checkZoteroRunning();
    if (!running) {
      showMessage("无法连接到 Zotero", 5000, 'error');
      return null;
    }
    
    // 直接调用 bridge 端点
    return await this._getSelectedItemsFromBridge();
  }

  public async getItemNote(): Promise<Record<string, string>> {
    const running = await this.checkZoteroRunning();
    if (!running) {
      showMessage("无法连接到 Zotero", 5000, 'error');
      return null;
    }
    
    // 混合调用：bridge 获取 key，Local API 获取数据
    const selectedItems = await this._getSelectedItemsFromBridge();
    if (!selectedItems || selectedItems.length === 0) {
      return null;
    }
    
    const notes: Record<string, string> = {};
    for (const item of selectedItems) {
      const children = await this._getItemChildren(item.key);
      const noteChildren = children.filter(c => c.itemType === 'note');
      
      for (const note of noteChildren) {
        const noteTitle = note.data.title || item.title;
        notes[noteTitle] = note.data.note;
      }
    }
    
    return notes;
  }

  public async checkZoteroRunning(): Promise<boolean> {
    // 优先检查 Local API（无需认证）
    try {
      const response = await fetch('http://127.0.0.1:23119/api/', { method: 'GET' });
      if (response.ok) return true;
    } catch (e) {
      this.logger.error('Local API check failed', e);
    }
    
    // Fallback: Connector
    try {
      const response = await fetch('http://127.0.0.1:23119/connector/ping', { method: 'GET' });
      return response.ok;
    } catch (e) {
      this.logger.error('Connector check failed', e);
      return false;
    }
  }

  // ============ Private Methods ============
  
  private async _getSelectedItemsFromBridge(): Promise<ISelectedItem[]> {
    try {
      const response = await fetch('http://127.0.0.1:23119/f-zotero-ext/api/v1/selected');
      if (!response.ok) {
        throw new Error(`Bridge returned ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Unknown error');
      }
      
      return data.items;
    } catch (e) {
      this.logger.error('Failed to get selected items from bridge', e);
      showMessage('无法获取选中项，请确认 Bridge 扩展已安装', 5000, 'error');
      return null;
    }
  }
  
  private async _getItemChildren(itemKey: string): Promise<any[]> {
    try {
      const response = await fetch(`http://127.0.0.1:23119/api/users/0/items/${itemKey}/children`);
      if (!response.ok) {
        throw new Error(`Local API returned ${response.status}`);
      }
      
      return await response.json();
    } catch (e) {
      this.logger.error(`Failed to get children for item ${itemKey}`, e);
      return [];
    }
  }

  // ============ Deprecated - 已删除 ============
  // executeZoteroJS() 方法已完全删除
}
```

## Configuration Storage Fix

### Problem: Double-Write Bug

**根因**：Zotero 是 14 个使用 `declareModuleConfig` 的模块中，唯一没有显式 `dump()` 方法的模块。

当没有 `dump()` 时，`settings/index.ts` 的 `saveModuleConfig()` 会 fallback 到遍历所有 `items[].get()` 来获取值并保存到 `custom-module.config.json`。

对 Zotero 来说：
- `zoteroDir` 的 `get()` 返回**当前设备**的路径
- 这个单设备值被写入 `custom-module.config.json`（会跨设备同步）
- 其他设备读取时会得到错误的路径

### Before: Legacy Storage with Bug

```typescript
// src/func/zotero/config.ts
let configs = { zoteroPassword: 'CTT' };
let zoteroDir = {};

export const declareModuleConfig = {
    key: 'Zotero',
    load: async (data) => {
        configs.zoteroPassword = data.zoteroPassword ?? configs.zoteroPassword;
        let configDir = await plugin.loadData('zoteroDir.config.json');
        if (configDir) {
            zoteroDir = deepMerge(zoteroDir, configDir);
        }
    },
    // ❌ 没有 dump() 方法 - 导致 settings 系统遍历 items[].get()
    items: [
        {
            key: 'zoteroDir',
            get: () => getZoteroDir(),  // 返回当前设备的 zoteroDir
            set: (value) => {
                zoteroDir[device.id] = value;
                plugin.saveData('zoteroDir.config.json', zoteroDir);
            }
        }
    ]
};

// Storage状态：
// configs.json:
//   { "Misc": { "zoteroPassword": "CTT" } }  ← zombie, 已注释但数据残留
// zoteroDir.config.json:
//   { "<device-id>": "H:\\Media\\Zotero" }  ← 实际使用的 SOT
// custom-module.config.json:
//   { "Zotero": { "zoteroDir": "H:\\..." } }  ← Bug: 单设备值被错误写入
```

### After: Fixed with Explicit dump()

```typescript
// src/func/zotero/config.ts
import { thisPlugin, deepMerge } from "@frostime/siyuan-plugin-kits";
import { documentDialog } from "@/libs/dialog";

let configs = { zoteroPassword: '', _migrated: true };
let zoteroDir = {};

export const getZoteroDir = () => {
    const device = window.siyuan.config.system;
    return zoteroDir[device.id] ?? '';
};

export const getPassword = () => configs.zoteroPassword;

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'Zotero',
    title: 'Zotero',
    
    load: async (data) => {
        // 1. 迁移 zoteroPassword（从旧的 configs.json Misc 组）
        const plugin = thisPlugin();
        const oldPassword = plugin.getConfig('Misc', 'zoteroPassword');
        const needMigration = oldPassword && oldPassword.trim() !== '';
        
        if (needMigration && !data?._migrated) {
            // 有旧配置，迁移
            configs.zoteroPassword = oldPassword;
            configs._migrated = false;  // 标记为"需要提示用户"
        } else {
            // 正常加载
            configs.zoteroPassword = data?.zoteroPassword ?? '';
            configs._migrated = data?._migrated ?? true;
        }
        
        // 2. 加载 zoteroDir（独立文件，不迁移）
        let configDir = await plugin.loadData('zoteroDir.config.json');
        if (configDir) {
            zoteroDir = deepMerge(zoteroDir, configDir);
        }
    },
    
    // ✅ 核心修复：显式 dump()，只导出 zoteroPassword，排除 zoteroDir
    dump: () => ({
        zoteroPassword: configs.zoteroPassword,
        _migrated: configs._migrated,
        // zoteroDir intentionally excluded - stored in zoteroDir.config.json
    }),
    
    items: [
        {
            key: 'zoteroDir',
            type: 'textinput',
            title: 'Zotero 数据存储目录',
            description: '见 Zotero 「设置 - 高级 - 数据存储目录」；本配置选项在各个设备上互相独立',
            get: () => getZoteroDir(),
            set: (value) => {
                const device = window.siyuan.config.system;
                zoteroDir[device.id] = value;
                const plugin = thisPlugin();
                plugin.saveData('zoteroDir.config.json', zoteroDir);  // 直接写入独立文件
            }
        },
        {
            key: 'checkConnection',
            type: 'button',
            title: '检查连接',
            description: '检查 Zotero Local API 和 Bridge 扩展是否正常',
            get: () => '',
            set: () => {},
            button: {
                label: '检查连接',
                callback: async () => {
                    const results = await checkZoteroConnection();
                    showConnectionStatus(results);
                }
            }
        }
    ],
    
    help: () => {
        documentDialog({
            sourceUrl: `{{docs}}/zotero-desc.md`,
        });
    }
};

async function checkZoteroConnection() {
    const apiOk = await fetch('http://127.0.0.1:23119/api/')
        .then(r => r.ok).catch(() => false);
    const bridgeOk = await fetch('http://127.0.0.1:23119/f-zotero-ext/api/v1/status')
        .then(r => r.ok).catch(() => false);
    
    return { apiOk, bridgeOk };
}

function showConnectionStatus({ apiOk, bridgeOk }) {
    if (apiOk && bridgeOk) {
        showMessage('✅ Zotero Local API 和 Bridge 扩展都正常');
    } else if (apiOk && !bridgeOk) {
        showMessage('⚠️ Zotero 运行正常，但 Bridge 扩展未安装或未启动\n\n请查看帮助文档了解如何安装', 6000, 'error');
    } else if (!apiOk && bridgeOk) {
        showMessage('⚠️ Bridge 扩展正常，但 Zotero Local API 未启用\n\n请在 Zotero 设置中启用 Local API', 6000, 'error');
    } else {
        showMessage('❌ Zotero 未运行或未正确配置', 5000, 'error');
    }
}
```

### Migration Data Flow

```
Old Storage (Before):
  configs.json:
    { "Misc": { "zoteroPassword": "CTT" } }  ← zombie, 已注释但数据残留
  zoteroDir.config.json:
    { "<device-id>": "H:\\Media\\Zotero" }  ← 仍在使用
  custom-module.config.json:
    { "Zotero": { "zoteroDir": "H:\\..." } }  ← Bug: zoteroDir 被错误写入

                    ↓ Migration in load()

New Storage (After):
  custom-module.config.json:
    {
      "Zotero": {
        "zoteroPassword": "CTT",     ← 从 configs.json Misc 迁移
        "_migrated": false            ← 标记为需要提示用户
        // zoteroDir 不再存在于此文件
      }
    }
  zoteroDir.config.json:
    { "<device-id>": "H:\\Media\\Zotero" }  ← 继续独立存储，不改变
  configs.json:
    { "Misc": { "zoteroPassword": "CTT" } }  ← 保留但标记废弃
```

**关键修复**：
- `dump()` 只返回 `{ zoteroPassword, _migrated }`，不包含 `zoteroDir`
- `zoteroDir` 继续使用独立文件，settings 系统不再保存它到 `custom-module.config.json`
- 解决了 Critical C1 风险（跨设备同步导致路径错误）

## Migration UX Flow

```
User first calls Zotero feature (/cite or /note)
  ↓
index.ts load() → checkAndShowMigrationDialog()
  ↓
Check conditions:
  1. configs._migrated === false  (在 load() 中设置)
  ↓
If true → Show migration dialog
  ↓
documentDialog({
  title: '⚠️ Zotero 功能升级提示',
  sourceUrl: '{{docs}}/zotero-migration.md',
  width: '600px',
  height: '500px'
})
  ↓
User clicks "已完成迁移" → Set configs._migrated = true and save
```

## Bridge Extension API

Current implementation in `src/external/zotero-bridge/bootstrap.js`:

```javascript
// Endpoints registered:
ENDPOINT_PREFIX = "/f-zotero-ext/api/v1"

// /f-zotero-ext/api/v1/status
GET → {
  ok: true,
  plugin: "f-zotero-ext@frostime.github.io",
  version: "0.1.0",
  zotero: "9.0.5"
}

// /f-zotero-ext/api/v1/selected
GET → {
  ok: true,
  count: 2,
  items: [
    {
      key: "PXW99EKT",
      itemType: "journalArticle",
      title: "Attention Is All You Need",
      creators: [{firstName: "Ashish", lastName: "Vaswani", ...}],
      date: "2017",
      url: "...",
      DOI: "..."
    },
    ...
  ]
}
```

## Build & Distribution

### Bridge Extension Packaging

```bash
# src/external/zotero-bridge/pack.sh
#!/bin/bash
cd "$(dirname "$0")"
rm -f f-zotero-ext.xpi
zip -r f-zotero-ext.xpi manifest.json bootstrap.js
echo "✅ Created f-zotero-ext.xpi"
```

### Vite Build Integration

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    // ... existing plugins ...
    
    // Copy bridge .xpi to dist
    {
      name: 'copy-zotero-bridge',
      closeBundle() {
        const src = 'src/external/zotero-bridge/f-zotero-ext.xpi';
        const dest = 'dist/external/zotero-bridge/f-zotero-ext.xpi';
        
        if (fs.existsSync(src)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
          console.log('✅ Copied zotero-bridge extension to dist');
        }
      }
    }
  ]
});
```

## Key Fix Summary

**问题根因**：Zotero 缺少 `dump()` 方法，导致 settings 系统遍历 `items[].get()` 保存配置时，将设备独立的 `zoteroDir` 写入会跨设备同步的 `custom-module.config.json`。

**解决方案**：添加显式 `dump()` 方法，选择性导出配置项（借鉴 doc-context/insert-time 模式）。

**影响范围**：
- 代码改动：仅 5 行
- 影响文件：仅 `src/func/zotero/config.ts`
- 不触碰核心设置系统 `settings/index.ts`
- 完全符合现有架构模式

## Future Extension: Auto-Update

**标记为待调研项，本次不实现。**

Potential approaches:
1. **GitHub Pages + updates.json**:
   - Host `updates.json` on GitHub Pages
   - Update `manifest.json` → `update_url` to real URL
   - Zotero checks for updates automatically

2. **思源插件内检测**:
   - 在配置面板增加"检查 Bridge 扩展更新"按钮
   - 对比本地安装版本与 GitHub Release 版本
   - 提示下载新版 `.xpi`

3. **Hybrid**:
   - Zotero 自动更新（需要 updates.json）
   - 思源内提供手动检查更新入口

记录在 `memory.md` Knowledge 中，待后续独立调研。
