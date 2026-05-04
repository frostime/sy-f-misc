---
name: siyuan-dom-reference
description: 本插件依赖的 SiYuan 平台 DOM 知识：CSS 变量、类名、data-* 属性、querySelector 模式
updated: 2026-05-04
scope:
  - /src/**/*.scss
  - /src/**/*.tsx
  - /src/**/*.ts
deprecated: false
---

# SiYuan DOM Reference

本插件依赖的 SiYuan 平台内置 DOM 知识。所有 CSS 变量定义在 `app/appearance/themes/{daylight,midnight}/theme.css`，类名定义在 `app/src/assets/scss/`。

---

## CSS 变量 (`--b3-*`)

### 主题色

| 变量 | 用途 | 示例值 (midnight) |
|------|------|-------------------|
| `--b3-theme-primary` | 主色调 | `#3573f0` |
| `--b3-theme-primary-light` | 主色 72% 不透明度 | `rgba(53,115,240,.72)` |
| `--b3-theme-primary-lighter` | 主色 48% | `rgba(53,115,240,.48)` |
| `--b3-theme-primary-lightest` | 主色 24% | `rgba(53,115,240,.24)` |
| `--b3-theme-primary-dark` | 主色深色 | — |
| `--b3-theme-secondary` | 强调色 | `#f3a92f` |
| `--b3-theme-background` | 页面背景 | `#1e1e1e` |
| `--b3-theme-background-light` | 背景浅色 | `rgba(255,255,255,.075)` |
| `--b3-theme-surface` | 卡片/面板背景 | `#262626` |
| `--b3-theme-surface-light` | 浮层背景 | `rgba(41,42,45,.86)` |
| `--b3-theme-surface-lighter` | 更浅浮层 | `rgba(230,230,230,.06)` |
| `--b3-theme-error` | 错误色 | `#d23f31` |
| `--b3-theme-error-light` | 错误浅色 | — |
| `--b3-theme-error-lighter` | 错误更浅 | — |
| `--b3-theme-success` | 成功色 | `#65b84d` |

注：实际值根据使用的主题不一而足。

### 文字色

| 变量 | 用途 |
|------|------|
| `--b3-theme-on-primary` | 主色上的文字（白） |
| `--b3-theme-on-background` | 背景上的文字 |
| `--b3-theme-on-background-light` | 背景上的浅色文字 |
| `--b3-theme-on-surface` | 面板上的文字 |
| `--b3-theme-on-surface-light` | 面板上的次要文字 |
| `--b3-theme-on-error` | 错误色上的文字 |

### UI 基础

| 变量 | 用途 |
|------|------|
| `--b3-border-color` | 边框色 |
| `--b3-border-radius` | 圆角 (6px) |
| `--b3-border-radius-s` | 小圆角 (3px) |
| `--b3-border-radius-b` | 大圆角 (12px) |
| `--b3-scroll-color` | 滚动条色 |
| `--b3-dialog-shadow` | 对话框阴影 |
| `--b3-tooltips-color` | 提示文字色 |
| `--b3-menu-background` | 菜单背景 |
| `--b3-list-hover` | 列表悬停色 |
| `--b3-mask-background` | 遮罩色 |

### 字体

| 变量 | 用途 |
|------|------|
| `--b3-font-family` | 主字体 |
| `--b3-font-family-code` | 代码字体 |
| `--b3-font-family-protyle` | 编辑器字体 |
| `--b3-font-size` | 基础字号 (14px) |
| `--b3-font-color1`~`--b3-font-color13` | 自定义文字色（13 色） |

### 卡片状态色

| 变量 | 用途 |
|------|------|
| `--b3-card-error-color` / `-background` | 错误卡片 |
| `--b3-card-warning-color` / `-background` | 警告卡片 |
| `--b3-card-info-color` / `-background` | 信息卡片 |
| `--b3-card-success-color` / `-background` | 成功卡片 |

---

## DOM 类名

### Protyle 编辑器

| 类名 | 元素 | 源文件 |
|------|------|--------|
| `.protyle` | 编辑器容器 | `protyle/` |
| `.protyle-wysiwyg` | 所见即所得编辑区 | `protyle/` |
| `.protyle-wysiwyg--select` | 选中的块（选区高亮） | `protyle/` |
| `.protyle-title` | 文档标题容器 | `protyle/` |
| `.protyle-title__input` | 文档标题输入框 | `protyle/` |
| `.protyle-content` | 内容区容器 | `protyle/` |
| `.protyle-icons` | 块左侧图标区 | `protyle/` |
| `.protyle-breadcrumb` | 面包屑导航 | `protyle/` |

### Layout 布局

| 类名 | 元素 | 源文件 |
|------|------|--------|
| `.layout` | 顶层布局容器 | `business/_layout.scss` |
| `.layout__wnd--active` | 当前活动窗口 | `business/_layout.scss` |
| `.layout__center` | 中心区域 | `business/_layout.scss` |
| `.layout__dockl` / `__dockr` / `__dockb` | 左/右/下 Dock | `business/_layout.scss` |
| `.layout-tab-bar` | Tab 栏 | `business/_layout.scss` |
| `.layout-tab-container` | Tab 内容容器 | `business/_layout.scss` |

### B3 组件

| 类名 | 元素 | 源文件 |
|------|------|--------|
| `.b3-dialog__container` | 对话框容器 | `component/_dialog.scss` |
| `.b3-menu__item` | 菜单项 | `component/_menu.scss` |
| `.b3-menu__item--current` | 当前选中菜单项 | `component/_menu.scss` |
| `.b3-menu__action` | 菜单操作按钮 | `component/_menu.scss` |
| `.b3-list-item__text` | 列表项文字 | `component/_list.scss` |
| `.b3-card` | 卡片 | `component/_card.scss` |
| `.b3-button` | 按钮 | `component/_button.scss` |
| `.b3-button--outline` | 描边按钮 | `component/_button.scss` |
| `.b3-tooltips` | 提示气泡 | `component/_tooltips.scss` |
| `.b3-typography` | 排版容器 | `component/_typography.scss` |
| `.b3-label` | 设置标签 | `component/_form.scss` |

### 辅助类

| 类名 | 用途 |
|------|------|
| `.fn__none` | 隐藏 (display: none) |
| `.fn__flex` | flex 布局 |
| `.fn__flex-1` | flex: 1 |
| `.fn__flex-shrink` | flex-shrink |
| `.item--focus` | 当前聚焦项 |
| `.item__text` | 项文字 |
| `.item__close` | 关闭按钮 |

---

## data-* 属性

| 属性 | 值 | 用途 | 使用频率 |
|------|-----|------|---------|
| `data-node-id` | 块 ID | 定位任意块（段落/标题/文档/超级块等） | ★★★★★ |
| `data-type="wnd"` | — | 窗口容器 | ★★★ |
| `data-type="tab-header"` | — | Tab 头部元素 | ★★★ |
| `data-type="a"` | — | 链接 span | ★★ |
| `data-type="block-ref"` | — | 块引用 span | ★★ |
| `data-type="NodeAttributeView"` | — | 数据库视图块 | ★★ |
| `data-av-id` | 数据库 ID | 配合 NodeAttributeView | ★★ |
| `data-id` | 通用 ID | Tab、菜单项、文件树项 | ★★★ |
| `data-msg-id` | 消息 ID | GPT 对话消息（本插件自定义） | ★★ |
| `data-session-id` | 会话 ID | GPT 对话会话（本插件自定义） | ★ |

---

## querySelector 高频模式

### 获取当前活动文档/编辑器

```typescript
// 获取当前活动 Tab 中的 protyle 标题
const activeTab = document.querySelector('.layout-tab-container.fn__flex-1>div[data-node-id]');
const eleTitle = activeTab?.querySelector(".protyle-title");
const docId = eleTitle?.getAttribute("data-node-id");

// 等价写法（更通用）
const activeTab = document.querySelector('.layout-tab-container div.protyle[data-node-id]');

// 获取所有窗口的 Tab 列表
const tabs = document.querySelectorAll('div[data-type="wnd"] ul.layout-tab-bar>li.item--focus');
```

**使用方**：`ActiveDocProvider`、`document-tools`（3 个文件，完全相同的表达式）

### 定位特定块

```typescript
// 通过块 ID 定位 DOM 元素
const blockElement = document.querySelector(`[data-node-id="${blockId}"]`);

// 获取块的 protyle 容器
const protyle = blockElement.closest('.protyle');
```

**使用方**：`floating-chat`、`chat-in-doc`、`markdown`（6 个文件）

### 获取选中文本

```typescript
// 获取所有选中的块
let nodes = document.querySelectorAll('.protyle-wysiwyg--select');
// 获取选区所在的编辑器
const element = range?.startContainer.parentElement.closest('.protyle-wysiwyg');
```

**使用方**：`SelectedTextProvider`、`gpt/index.ts`（3 个文件）

### 定位 Tab 头部

```typescript
// 通过 data-id 定位 Tab
const tab = document.querySelector(`li[data-type="tab-header"][data-id="${id}"]`);

// 获取当前聚焦的 Tab
const tab = document.querySelector('li[data-type="tab-header"]');
```

**使用方**：`use-attachment-input`、`quick-draft`、`private-func`（4 个文件）

### 定位 Dock 和工具栏

```typescript
// 文件树 Dock
const dock = document.querySelector('.dock__items>span[data-type="file"]');

// 同步按钮
const syncBtn = document.querySelector('#toolbar>#barSync');

// 状态栏
const statusBar = document.querySelector('#status');

// Dock 栏
const dockBar = document.querySelector('#barDock');
```

**使用方**：`doc-context`、`auto-sync`、`toggl`（各 1 个文件）

### 定位文件树

```typescript
// 当前聚焦的文件树项
const focusItem = document.querySelector('div.file-tree span[data-type="focus"]');
```

**使用方**：`doc-context`、`docky`

---

## Agent 注意事项

1. **`data-node-id` 是最核心的选择器** — SiYuan 几乎所有块都有这个属性，是 DOM 操作的主要锚点
2. **获取活动文档的标准模式** — `.layout-tab-container` + `.protyle[data-node-id]`，三处代码完全相同，修改时需同步
3. **CSS 变量跟随主题切换** — daylight 和 midnight 主题的变量值不同，不要硬编码颜色值
4. **`.fn__*` 是 SiYuan 全局工具类** — 不要自创同名类，会冲突
5. **`#toolbar`、`#barDock`、`#status` 是 SiYuan 顶层容器 ID** — 只有 1-2 处使用，修改时需确认这些 ID 是否稳定
