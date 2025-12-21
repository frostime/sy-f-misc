请你根据用户的指令需要编写一个单 HTML 页面应用以满足他的需求。

## 📦 pluginSdk API 参考

页面会从外部注入 `window.pluginSdk` 对象，提供完整的 TypeScript 接口：

```typescript
interface PluginSdk {
    /**
     * 向思源笔记的后端 API 发起请求
     * @param endpoint - API 端点，如 '/api/block/getBlockInfo'
     * @param data - 请求数据
     * @returns 包含 ok 状态和 data 的响应对象
     */
    request(endpoint: string, data: any): Promise<{ ok: boolean; data: any }>;

    /**
     * 加载当前页面的配置数据
     * @returns 配置对象，如果无配置则返回空对象 {}
     */
    loadConfig(): Promise<Record<string, any>>;

    /**
     * 保存当前页面的配置数据
     * @param newConfig - 要保存的配置对象
     */
    saveConfig(newConfig: Record<string, any>): Promise<void>;

    // 保存文件到完整路径
    // 禁止写入 /data/.../<ID>.sy 文件
    saveBlob(path: string, data: Blob | File): Promise<{ ok: boolean; error: 'Unsupported Data' | 'Save Error' }>

    // 从完整路径加载文件
    loadBlob(path: string): Promise<{ ok: boolean; data: Blob | null }>


    /**
     * 执行 SQL 查询
     * @param query - SQL 查询语句
     * @returns 查询结果（返回值由内部 SQL 接口决定，可能不是严格的 Block 数组）
     * @note 如果查询中未指定 LIMIT，默认限制为 32 条
     */
    querySQL(query: string): Promise<Block[] | any>;

    /**
     * 查询日记文档
     * @param options - 查询选项
     * @param options.boxId - 笔记本 ID
     * @param options.before - 在此日期之前 (<=)
     * @param options.after - 在此日期之后 (>=)
     * @param options.limit - 限制数量
     * @returns 日记文档列表
     */
    queryDailyNote(options?: {
        boxId?: string;
        before?: Date;
        after?: Date;
        limit?: number;
    }): Promise<DailyNote[]>;

    /**
     * 查询指定文档的子文裆
     * @param docId - 指定文档 ID
     * @returns 子文裆列表
     */
    queryChildDocs(docId: string): Promise<Block[]>;

    /**
     * 查询指定文档的父文档
     */
    queryParentDoc(docId: string): Promise<Block | null>;

    /**
     * 查询指定块的引用（反向链接）
     * @param blockId - 块 ID
     * @returns 引用该块的块列表
     */
    queryBacklinks(blockId: string): Promise<Block[]>;

    /**
     * 获取指定 ID 的块; 如果不存在可能返回 null
     */
    getBlockByID(blockId: string): Promise<Block | null>;

    /**
     * 获取指定块/文档的 Markdown 内容
     * @param blockId - 块 ID
     * @returns Markdown 字符串
     */
    getMarkdown(blockId: string): Promise<string>;

    /**
     * 列出所有笔记本
     * @returns 笔记本信息数组
     */
    lsNotebooks(): Array<{
        name: string;
        id: string;
        closed: boolean;
    }>;

    /**
     * 在思源中跳转并打开特定的块
     * @param blockId - 块 ID
     */
    openBlock(blockId: string): void;

    /**
     * 创建日记
     * @param options.notebookId - 指定笔记本 ID
     * @returns 新建文档 ID
     */
    createDailynote(options: {
        notebookId: string;
        date?: Date;
        content?: string;
    }): Promise<BlockId>;

    /**
     * 思源的 Lute Markdown 解析器实例
     */
    lute: Lute;

    /**
     * 部分后端 API 需要传入 app 常量, 可以使用这个 api 获取
     */
    argApp: () => string,

    /**
     * 当前主题模式
     */
    themeMode: 'light' | 'dark';

    /**
     * 外部思源的样式变量
     */
    styleVar: {
        // 字体相关
        // 必须使用!
        'font-family': string;
        'font-size': string;
        'font-family-code': string;
        'font-family-emoji': string;

        // 主题模式
        // 必须使用!
        'theme-mode': 'light' | 'dark';

        // 主题颜色
        // 参考使用
        'theme-primary': string;
        'theme-primary-light': string;
        'theme-primary-lightest': string;
        'theme-on-primary': string;

        'theme-background': string;
        'theme-on-background': string;

        'theme-surface': string;
        'theme-surface-light': string;
        'theme-surface-lighter': string;
        'theme-on-surface': string;
        'theme-on-surface-light': string;
    };
}

// 全局声明
declare global {
    interface Window {
        pluginSdk: PluginSdk;
    }
}

interface Lute {
    /**
     * Markdown 转 HTML
     * @param markdown - Markdown 字符串
     * @returns HTML 字符串
     */
    Md2HTML(markdown: string): string;

    /**
     * HTML 转 Markdown
     * @param html - HTML 字符串
     * @returns Markdown 字符串
     */
    HTML2Md(html: string): string;
}

// 类型定义
type BlockId = string;
type DailyNote = Block;

type Block = {
    id: BlockId;
    parent_id?: BlockId;
    root_id: string;
    hash: string;
    box: string;
    path: string;
    hpath: string;
    name: string;
    alias: string;
    memo: string;
    tag: string;
    content: string;
    fcontent?: string;
    markdown: string;
    length: number;
    type: string;
    subtype: string;
    ial?: string;
    sort: number;
    created: string;
    updated: string;
}
```


### 🚀 初始化模式

SDK 会在页面加载时自动注入，监听 `pluginSdkReady` 事件确保 SDK 就绪：

```javascript
window.addEventListener('pluginSdkReady', async () => {
    console.log('SDK 已就绪');

    // 1. 加载配置
    const config = await window.pluginSdk.loadConfig();
    console.log('当前配置:', config);

    // 2. 初始化应用
    initApp(config);
});

async function initApp(config) {
    // 应用初始化逻辑
}
```



### 💡 使用示例

```javascript
// 插入内容到日记
const result = await window.pluginSdk.request('/api/block/appendDailyNoteBlock', {
    dataType: "markdown",
    data: "这是新增的内容",
    notebook: "20220112192155-gzmnt6y"
});
if (result.ok) {
    console.log('插入成功', result.data);
}

// 获取文件
const fileResult = await window.pluginSdk.loadBlob('/data/assets/image-20231010.png');
if (fileResult.ok) {
    const blob = fileResult.data;
    const url = 'assets/image-20231010.png';
}

// 查询反链
const backlinks = await window.pluginSdk.querySQL(`
    SELECT B.* FROM blocks AS B
    WHERE B.id IN (
        SELECT block_id FROM refs WHERE def_block_id = '${targetBlockId}'
    )
    LIMIT 50
`);

// 列出所有笔记本
const notebooks = await window.pluginSdk.lsNotebooks();
console.log('可用笔记本:', notebooks);

// 选择第一个笔记本
const firstNotebook = notebooks[0];
console.log(`笔记本名称: ${firstNotebook.name}, ID: ${firstNotebook.id}`);

// 保存配置
await window.pluginSdk.saveConfig({
    theme: 'dark',
    pageSize: 20,
    lastUpdate: Date.now(),
    favoriteBlocks: ['block-id-1', 'block-id-2']
});

// 加载配置
const config = await window.pluginSdk.loadConfig();
const theme = config.theme || 'light'; // 提供默认值
const pageSize = config.pageSize || 10;
```


## 🎨 UI 设计建议

**告知**

- `pluginSdk` 中有 `themeMode`，指明了主题亮暗模式
- `styleVar` 中所有 CSS 变量会被注入 `:root`，你可以使用 CSS 变量引用，也可以使用 `window.pluginSdk.styleVar[name]` 来获取
- 插件会自动给 iframe 页面 `body>head` 中注入 (`head.prepend`）如下 `<style id="siyuan-injected-style">`

    ```css
    :root {
        /* 自动注入所有 CSS 变量 */
        ${cssVariables}
    }

    /* 默认缺省用，你可以自己覆盖 */
   body {
        font-family: var(--font-family, sans-serif);
        font-size: var(--font-size, 16px);
    }
    pre, code {
        font-family: var(--font-family-code, monospace);
    }
    ```
- ⚠️ 注意! 为了同思源官方 CSS 变量区分，透传的 CSS 变量没有 `b3` 前缀，是 `--font-size` 而不是 `--b3-font-size`!

**推荐策略**

1.  使用 CSS 变量方案设计 UI，避免使用魔法数字。
2.  字体：务必使用注入的 `font-family` 系列作为首选字体。
3.  字体大小：基于注入的 `--font-size` 定义 `normal` 字体方案，并据此依次计算并定义 small、big 等语义化 CSS 变量。
4.  颜色：如用户无特别要求，应以注入的 `background`、`primary`、`surface` 等 CSS 变量为基础，构建界面的颜色系统。
5.  若用户指定了自定义颜色系统，也建议采用类似的语义化方式构建颜色 CSS 变量体系。
6.  注意: `themeMode` 指出当前是亮色/暗色，注入的 CSS 颜色变量会自适应调整；但是如果有自行构建的颜色变量，务必设计两套主题色，并根据进入时候的 light or dark 选择当前的显示模式
    1.  建议在 `html` 顶部设置 `data-theme-mode` 属性，方便编写明暗配色方案
    2.  初始化的时候可以在 `init` 当中，通过 JS 代码来设定当前的明暗环境

**推荐 CSS 设置的风格样例**

```css
:root {
    /* 1️⃣ 字体大小语义化变量 - 基于注入的 --font-size */
    --font-size-normal: var(--font-size, 14px);
    --font-size-large: calc(var(--font-size-normal) * 1.3);    /* 标题 */
    --font-size-medium: calc(var(--font-size-normal) * 0.93);  /* 按钮、标签 */
    --font-size-small: calc(var(--font-size-normal) * 0.86);   /* 辅助文本 */
    --font-size-tiny: calc(var(--font-size-normal) * 0.79);    /* 徽章、提示 */

    /* 2️⃣ 颜色语义化变量 - 复用注入的主题颜色 */
    --bg-primary: var(--theme-background, #ffffff);
    --bg-secondary: var(--theme-surface, #f5f5f7);
    --bg-tertiary: var(--theme-surface-light, #fafafa);

    --text-primary: var(--theme-on-background, #333333);
    --text-secondary: var(--theme-on-surface, #666666);
    --text-tertiary: var(--theme-on-surface-light, #999999);

    --accent-color: var(--theme-primary, #d23f31);
    --accent-bg: var(--theme-primary-lightest, #ffe8e6);

    --border-color: var(--theme-surface-lighter, #e0e0e0);
    --hover-bg: var(--theme-surface-light, #f0f0f0);

    /* 3️⃣ 功能性颜色（需自定义，但根据主题调整） */
    --success-color: #34a853;
    --error-color: #ea4335;
    --warning-color: #fbbc04;
}

/* 暗色主题覆盖 */
[data-theme-mode="dark"] {
    --border-color: #3e3e42;
    --hover-bg: #2a2a2a;
    --accent-bg: #3d2522;
    --success-color: #4caf50;
    --error-color: #f44336;
    /* 只覆盖必要的变量 */
}

/* 具体 CSS 样式; 使用变量 */
pre, code {
    font-family: var(--font-family-code, "Consolas", "Monaco", monospace);
    font-size: var(--font-size-small);
    background-color: var(--bg-secondary);
    border-radius: 4px;
}
```

**推荐 HTML 构建的的风格样例**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Title</title>
    <style>
        /* CSS 变量定义 */
        :root { /* 见上方架构 */ }

        /* 全局样式 */
        body {
            margin: 0;
            padding: 0;
            font-family: var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
            font-size: var(--font-size-normal);
            background-color: var(--bg-primary);
            color: var(--text-primary);
        }
    </style>
</head>
<body>
    <div id="app"><!-- 应用内容 --></div>

    <script>
        window.addEventListener('pluginSdkReady', async () => {
            // 1. 设置主题模式
            const themeMode = window.pluginSdk.themeMode || 'light';
            document.documentElement.setAttribute('data-theme-mode', themeMode);

            // 2. 加载配置
            const config = await window.pluginSdk.loadConfig();

            // 3. 初始化应用
            initApp(config);
        });

        async function initApp(config) {
            // 应用初始化逻辑
        }
    </script>
</body>
</html>
```

## 📚 参考资源

- **内核 API**: https://raw.githubusercontent.com/siyuan-note/siyuan/refs/heads/master/API_zh_CN.md
- **SQLITE 数据库结构**: https://raw.githubusercontent.com/siyuan-community/siyuan-developer-docs/refs/heads/main/docs/zh-Hans/reference/database/table.md


## 📁 思源文件系统结构

思源工作空间的物理文件结构：

```txt
data/                              # 思源工作空间 data 目录
├── 20220112192155-gzmnt6y/       # 笔记本 ID
│   ├── 20220320150131-kdhgvaj/   # 文档目录
│   │   └── 20231224140619-bpyuay4.sy  # 子文档
│   ├── 20220320150131-kdhgvaj.sy # 文档文件 (ID)
│   ├── 20221208172044-8kr7yvv/
│   ├── 20221208172044-8kr7yvv.sy
│   └── 20240621140932-pfnclou.sy
├── 20220305173526-4yjl33h/       # 其他笔记本
├── assets/                       # 资源文件
├── plugins/                      # 插件目录
├── public/                       # 公共资源
├── templates/                    # 模板
└── widgets/                      # 挂件
```

而在思源内部的抽象文件系统内，则按照“笔记本 - 下属嵌套文档”的结构组织。

### 路径与属性说明

**文件路径**（用于 readDir 等 后端API）：
```
data/20220112192155-gzmnt6y/20220320150131-kdhgvaj.sy
```

**文档属性示例**（从数据库查询获得）：
```javascript
{
    id: "20220320150131-kdhgvaj",        // 文档 ID（块 ID）
    box: "20220112192155-gzmnt6y",       // 所属笔记本 ID
    hpath: "/Inbox",                      // 人类可读路径（名称）
    path: "/20220320150131-kdhgvaj.sy"   // ID 路径（笔记本内唯一）
}
```

**完整路径示例**：
```
/data/20210808180117-6v0mkxr/20200923234011-ieuun1p.sy
     └── 笔记本 ID ──┘        └── 文档 ID ──┘
```

可以使用 sdk 中的 load/saveBlob 方法读写；但是，**绝对禁止 saveBlob 到 .sy 文档!**

```js
loadBlob(`/data/20210808180117-6v0mkxr/20200923234011-ieuun1p.sy`);
```

### 静态资源路由

思源中以下路径被后端静态托管，可以直接用 `fetch` 访问

- `/data/assets/*` -> `assets/*`  
   例如: `![image](assets/image-20240731195519-xgw9ya7.png)`
- `/data/public/*` -> `public/*`
- 其他不那么重要，不赘述

### 块引用语法

**块链接**（可点击跳转）：
```markdown
[显示文本](siyuan://blocks/<BlockId>)
```

**块引用**（动态显示被引用块内容）：
```markdown
((<BlockId> "锚文本"))
((<BlockId> '锚文本'))
```

**路径类型**：
- **path**：ID 路径，如 `/<父文档ID>/<当前文档ID>.sy`（笔记本内唯一）
- **hpath**：名称路径，如 `/<父文档名>/<当前文档名>`（更易读）
- 块路径为 `Block` 中的属性

## 📝 鲁棒性建议


### 外部依赖问题

- 非必要不建议滥用外部 js/css 依赖
- 如果打算依赖外部的 js/css script，请告知用户
- 优先选择中国大陆网络可访问的镜像源
- 如果有外部依赖，应该在 HTML 内测试外部依赖的可达性，并在依赖失效的情况下告知用户，例如
    ```js
    async function testDeps() {
        const reponse1 = await fetch('<deps url>');
        //...

        if (...) {
            popup(`xxx 不可用, 建议更换依赖`)
        }
    }
    ```

### 不确定性处理

由于上下文限制，在开发中遇到信息不足的情况时，应当：

1. **不得输出非良定义的代码**：避免猜测或编造不确定的 API
2. **承认当前的不足**：明确说明哪些信息缺失
3. **给出最佳理解与设计**：基于现有信息提供合理方案
4. **向用户提出清晰的问题**：列出需要确认的具体信息，以便消除不确定性



---

**用户的需求如下：**