---
name: external-bundle
description: sy-f-misc 插件的 External 模块独立打包机制说明——将大型/按需模块从主 bundle 中拆出，运行时动态加载
updated: 2026-02-22
scope:
  - /vite.config.ts
  - /vite-plugin-external-modules.ts
  - /src/external/**
deprecated: false
---

# External Bundle 机制

## Overview

### 背景与动机

SiYuan 插件需要编译成**单一 `index.js` 文件**分发。当插件功能越来越多时，把所有代码塞进一个 bundle 会：

- 增大文件体积，拖慢插件启动时间
- 将低频/按需功能强制加载
- 引入不必要的依赖（如大型解析器、沙盒运行时等）

**External Bundle 机制**解决了这一问题：将指定模块独立编译成单独的 `.js` 文件，主 bundle 在需要时通过动态 `import()` 加载。

### 核心权衡

| 方案 | 优点 | 缺点 |
|------|------|------|
| 全部打入主 bundle | 简单、无额外加载开销 | bundle 体积大，启动慢 |
| External 独立打包 | 主 bundle 精简，按需加载 | 需要配置，首次加载有网络/IO 延迟 |

**适合 external 的模块特征**：
- 体积较大（> 5KB）
- 使用频率低（非核心启动路径）
- 功能独立（依赖简单，无复杂循环依赖）

---

## Architecture

### 整体流程

```
构建时：
  src/external/sandbox.ts
       │
       ▼ vite-plugin-external-modules (buildStart)
  独立 Vite build → dev/external/sandbox.js
                    dist/external/sandbox.js

主 bundle 构建时：
  import('@external/sandbox')
       │
       ▼ transform hook（路径重写）
  import('/plugins/sy-f-misc/external/sandbox.js')

运行时：
  主代码执行 import('/plugins/sy-f-misc/external/sandbox.js')
       │
       ▼ SiYuan 返回文件内容
  动态加载成功，拿到模块导出
```

### 核心组件

#### 1. `vite-plugin-external-modules.ts`

Vite 插件，提供两个阶段的处理：

**`buildStart` 阶段**：
- 扫描 `src/**/*.{ts,tsx,js,jsx}`，找到所有 `import('@external/xxx')` 的引用
- 对每个发现的模块，调用独立的 `vite build` 编译到 `<outputDir>/external/`
- 清理 external 目录中的无关文件（防止 vite 静态复制带来的污染）
- 检测 `import ... from '@external/xxx'` 静态导入并发出警告

**`transform` 阶段**：
- 将代码中的 `import('@external/xxx')` 或 `import('dev/external/xxx')` 路径
- 重写为运行时绝对路径：`import('/plugins/sy-f-misc/external/xxx.js')`
- 移除错误的静态导入语句（替换为注释提示）

#### 2. `vite.config.ts` 中的配置

```typescript
// 在此配置需要独立打包的模块
const EXTERNAL_MODULES = ["sandbox", "text-edit-engine"];
const PLUGIN_BASE_PATH = '/plugins/sy-f-misc';
```

只有在 `EXTERNAL_MODULES` 列表中的模块才会被扫描和构建；未注册的动态导入会触发警告。

#### 3. `rollupOptions.external`

```typescript
external: [
  "siyuan",
  "process",
  /^\/plugins\/sy-f-misc\//,   // 运行时路径：排除外部模块
  /^@external\//,              // 别名路径：防止主 bundle 意外包含
],
```

这两条 external 规则确保重写后的运行时路径**不被打入主 bundle**。

---

## Module Structure

### 源文件位置

所有 external 模块放在 `src/external/` 目录下。

**支持两种结构**：

```
单文件模块：
  src/external/sandbox.ts        →  dist/external/sandbox.js

目录模块：
  src/external/my-lib/
    index.ts                     →  dist/external/my-lib.js
    utils.ts                     (内部依赖，打入同一 bundle)
```

### 编译配置

每个 external 模块以 **ES module** 格式独立编译：

```typescript
{
  lib: {
    entry: entryPath,
    fileName: moduleName,
    formats: ['es'],        // ESM 格式
  },
  rollupOptions: {
    external: ['siyuan', 'process'],  // 不打入 siyuan API
    output: {
      entryFileNames: `${moduleName}.js`,
    },
  },
}
```

---

## Usage

### 注册模块（vite.config.ts）

```typescript
const EXTERNAL_MODULES = ["sandbox", "text-edit-engine", "my-new-module"];
```

### 创建模块文件

```typescript
// src/external/my-module.ts
export function doSomething(input: string): string {
    return input.trim();
}

export default class MyClass {
    // ...
}
```

### 在业务代码中使用

```typescript
// ✅ 正确：动态导入
async function useMyModule() {
    const mod = await import('@external/my-module');
    const result = mod.doSomething('hello');

    // 使用 default export
    const SandboxModule = await import('@external/sandbox');
    const JavaScriptSandBox = SandboxModule.default;
    const instance = new JavaScriptSandBox();
}

// ❌ 错误：静态导入（会被插件移除并警告）
import MyClass from '@external/my-module';
```

### TypeScript 类型支持

由于 tsconfig.json 中配置了路径别名：

```json
{
  "paths": {
    "@external/*": ["./src/external/*"]
  }
}
```

可以通过类型导入获得 IDE 支持：

```typescript
// 仅获取类型（不产生运行时静态导入）
import type { IExecutionResult } from '@external/sandbox';

// 动态导入时推断类型
const mod = await import('@external/sandbox');
type SandboxType = typeof mod.default;
```

---

## Output Structure

```
dist/
├── index.js              # 主 bundle（不含 external 模块代码）
├── index.css
├── plugin.json
├── external/
│   ├── sandbox.js        # 独立编译的 external 模块
│   └── text-edit-engine.js
├── pages/
├── docs/
└── ...
```

---

## Pitfalls & Edge Cases

### ❌ 不能在模块顶层使用静态导入

```typescript
// ❌ 会被插件移除，产生运行时错误
import Sandbox from '@external/sandbox';

// ✅ 必须在异步函数内动态导入
const { default: Sandbox } = await import('@external/sandbox');
```

### ❌ 未注册的模块会触发警告但不会构建

如果 `import('@external/foo')` 中的 `foo` 不在 `EXTERNAL_MODULES` 列表中，构建会警告。模块不会被编译，运行时加载会 404。

### ❌ External 模块不能 import 主 bundle 的内容

External 模块被独立编译，无法引用主 bundle 中的内容（如 `@/libs/xxx`）。
如果需要共享工具函数，要么复制到 external 模块内，要么提取为单独的 npm 包。

### ⚠️ 开发模式下的路径

开发时，模块输出到 `dev/external/xxx.js`，运行时路径同样是 `/plugins/sy-f-misc/external/xxx.js`（因为 SiYuan 挂载的是 `dev/` 目录）。
如果直接在测试代码中写路径，需要用 `dev/external/xxx` 别名或依赖插件转换。

### ⚠️ 构建时序

External 模块在 `buildStart` 阶段构建，早于主 bundle 的代码转换。
如果修改了 external 模块的代码，在 watch 模式下需要触发一次重新构建来生效（编辑任意 `.ts` 文件即可）。

---

## Real-World Example: Migrating sandbox.ts

**迁移前**：`src/libs/sandbox.ts` 静态导入，打入主 bundle。

```typescript
// script-tools.ts（旧）
import JavaScriptSandBox from "@/libs/sandbox";

execute: async (args) => {
    const instance = new JavaScriptSandBox();
    await instance.init();
    // ...
}
```

**迁移步骤**：

1. 移动文件：`src/libs/sandbox.ts` → `src/external/sandbox.ts`
2. 注册模块：`EXTERNAL_MODULES = ["sandbox"]`
3. 修改导入：

```typescript
// script-tools.ts（新）
// 无静态导入

execute: async (args) => {
    const SandboxModule = await import('@external/sandbox');
    const JavaScriptSandBox = SandboxModule.default;
    const instance = new JavaScriptSandBox();
    await instance.init();
    // ...
}
```

**效果**：主 bundle 减少 ~7.4KB，sandbox 代码仅在用户触发 JavaScript 工具时加载。
