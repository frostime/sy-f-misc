# External Modules 使用文档

## 概述

`src/external/` 目录下的模块会被单独打包，不会包含在主 `index.js` 中。
这样可以实现按需动态加载，减小主包体积。

## 配置说明

### 已配置的 Alias

- `@external` → `src/external`

### TypeScript 配置

已在 `tsconfig.json` 中配置路径映射:
```jsonc
{
  "paths": {
    "@external/*": ["./src/external/*"]
  }
}
```

## 支持的模块结构

### 1. 单文件模块

**文件路径**: `src/external/example-simple.ts`
**引用方式**: `import * as simple from '@external/example-simple'`
**编译输出**: `dist/external/example-simple.js`
**运行时路径**: `/plugins/sy-f-misc/external/example-simple.js`

### 2. 目录式模块 (index.ts)

**文件路径**: `src/external/utils/index.ts`
**引用方式**: `import * as utils from '@external/utils'`
**编译输出**: `dist/external/utils/index.js`
**运行时路径**: `/plugins/sy-f-misc/external/utils/index.js`

## 使用示例

### 创建外部模块

#### 示例 1: 简单模块

```typescript
// src/external/my-helper.ts
export const formatText = (text: string) => {
    return text.toUpperCase();
};

export default {
    formatText
};
```

#### 示例 2: 目录模块

```typescript
// src/external/advanced/index.ts
export class DataProcessor {
    process(data: any) {
        // 处理逻辑
    }
}

export const helper = {
    // 辅助函数
};
```

### 在主代码中使用

#### 静态导入（类型推断）

```typescript
// 在主代码中
import * as MyHelper from '@external/my-helper';
import * as Advanced from '@external/advanced';

// TypeScript 会正确识别类型
const result = MyHelper.formatText("hello");
```

**注意**: 静态导入在编译时会被重写为外部路径引用，不会打包进主 bundle。

#### 动态导入（推荐）

```typescript
// 延迟加载模块
async function loadHelper() {
    const helper = await import('@external/my-helper');
    return helper.formatText("hello");
}
```

### 运行时加载验证

参考 [EXAMPLE_USAGE.ts](./EXAMPLE_USAGE.ts) 中的完整示例：

```typescript
// 测试外部模块
export async function testExternalModules() {
    // 测试 simple 模块
    const simple = await import('@external/example-simple');
    console.log(simple.greet('World'));
    console.log(simple.add(10, 20));

    // 测试 utils 模块
    const utils = await import('@external/utils');
    const logger = new utils.Logger('TEST');
    logger.log('测试日志');
}
```

## 编译流程

### 构建过程

1. **Pre-build**: 扫描 `src/external/**/*.{ts,tsx,js}` 找到所有外部模块
2. **External Build**: 每个外部模块单独编译到 `dist/external/`
3. **Main Build**: 编译主入口 `src/index.ts`，`@external` 导入被重写为运行时路径

### 编译命令

```bash
# 生产构建
pnpm run build

# 开发模式（watch）
pnpm run dev:publish
```

### 验证编译结果

构建后检查:

1. `dist/external/` 目录下有独立的 `.js` 文件
2. `dist/index.js` 中不包含这些外部模块的代码
3. 外部模块引用形如: `require('/plugins/sy-f-misc/external/xxx.js')`

## 注意事项

### ✅ 推荐做法

1. 将较大的、不常用的功能模块放在 `external/` 下
2. 使用动态 `import()` 按需加载
3. 保持外部模块独立，减少相互依赖

### ❌ 避免的做法

1. 不要在外部模块之间循环引用
2. 不要将核心启动逻辑放在 `external/` 下
3. 避免在 `external/` 模块中导入主bundle的内容

### 限制说明

- ✅ 外部模块可以使用 `@` 别名访问 `src/` 下的类型定义
- ✅ 外部模块可以导入 `siyuan` API
- ⚠️ 外部模块之间的导入会被打包进该模块（不会再次分离）
- ❌ 主bundle **不能**直接静态导入外部模块的代码（会编译为外部引用）

## 示例模块说明

### example-simple.ts

演示最简单的外部模块结构：

- 导出函数
- 导出默认对象
- 纯工具函数，无依赖

### utils/index.ts

演示目录式模块：

- 多个工具函数
- 类定义
- 默认导出

### EXAMPLE_USAGE.ts

演示如何使用外部模块：

- 动态导入
- 运行时测试
- 编译验证要点

## 技术实现

### Vite 插件: externalRewritePlugin

```typescript
// 拦截 @external/* 导入
resolveId(source, importer) {
    if (source.startsWith('@external/')) {
        // 非外部模块中的引用 → 重写为运行时路径
        if (!importer?.includes('src/external/')) {
            return {
                id: `/plugins/sy-f-misc/external/${normalized}.js`,
                external: true
            };
        }
    }
}
```

### 构建钩子: buildExternalModules

在主构建前，使用 Vite API 独立编译每个外部模块。

## FAQ

### Q: 为什么需要外部模块？

**A**: 减小主包体积，提升首次加载速度，实现按需加载。

### Q: 外部模块会被多次打包吗？

**A**: 不会。每个外部模块只编译一次，输出到对应路径。

### Q: 可以在外部模块中使用 SolidJS 吗？

**A**: 可以！构建配置已包含 SolidJS 支持。

### Q: 如何调试外部模块？

**A**:
1. 构建时会生成 sourcemap（开发模式）
2. 可以在浏览器 DevTools 中查看 `/plugins/sy-f-misc/external/` 下的文件
3. 使用 `console.log` 输出调试信息

### Q: 外部模块的类型推断有问题怎么办？

**A**: 确保:
1. `tsconfig.json` 中配置了 `@external/*` 路径
2. 外部模块正确导出类型
3. 必要时显式声明类型: `const helper: typeof import('@external/xxx')`

## 总结

外部模块机制让你可以：

- ✨ 灵活组织代码结构
- 🚀 优化加载性能
- 📦 减小主包体积
- 🔧 独立开发和测试模块

开始在 `src/external/` 下创建你的模块吧！
