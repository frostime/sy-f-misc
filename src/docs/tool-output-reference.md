# GPT 工具返回类型索引

> 目的：给 LLM 和调试者一个“工具会返回什么”的明确参考，降低编排脚本时的幻想或误用。基于 `src/func/gpt/tools` 中现有实现，更新时间 2025-11-24。

## 通用数据结构速览

| 名称 | 字段 | 说明 |
| --- | --- | --- |
| `DocumentSummary` | `{ id, hpath, path, content, box }` | 由 `documentMapper` 生成，代表文档块；`content` 为文档标题。|
| `BlockSummary` | `{ id, type, root_id, content? , markdown? }` | 由 `blockMapper` 生成；文档块携带 `content`，其他块携带 `markdown`。|
| `KeywordSearchResult` | `{ id, type, content, root_id, parent_id, hpath, notebook: { id, name } }` | `searchKeyword` 输出，已移除 `<mark>` 标签。|
| `TavilySearchResponse` | `{ query, answer?, results[], images?, search_id, created_at, time }` | 详见 `web/tavily.ts`。|
| `WebPageContent` | `{ title, description, content, url, contentType }` | 仅内部使用；`WebPageContent` 工具向 LLM 返回格式化后的 Markdown 字符串。|

---

## 基础工具 (`basic-tools`)

| 工具 | 返回类型 | 内容结构 |
| --- | --- | --- |
| `datetime` | `string` | 默认 ISO 字符串。若传 `format`，返回自定义模板（YYYY/MM/DD 等）；若传 `timezone`，使用该时区的 ISO 字符串。错误时返回 `ToolExecuteStatus.ERROR`+消息。|
| `text` | `number \| number[] \| string` | `length` → 数字；`find` → 第一次匹配行号（-1 表示无）；`findAll` → 数组（匹配起始索引）；`replace/replaceAll` → 替换后的文本。支持 `/regex/flags` 语法，`:replaceAll` 会自动开启 `g`。|

---

## Web 检索与网页解析 (`web/*`)

### 搜索工具

| 工具 | 返回类型 | 内容结构与要点 |
| --- | --- | --- |
| `BingSearch` | `Array<{ title: string; link: string; description: string }>` | 若页面存在直接答案，会插入伪结果 `title="Bing 直接回答"`。`saveAndTruncate` 记录在 `bing-search`。|
| `TavilySearch` *(需配置 API Key)* | `TavilySearchResponse` | 包含 `results[]` (url/title/content/score/raw_content)、可选 `answer` 与 `images`。可能很长，未截断直接返回对象。|
| `BochaSearch` *(需配置 Key)* | `{ code: number; queryContext: any; webPages: Array<{ datePublished, name, url, abstract, siteName }> }` | SDK 响应被裁剪为上述结构（默认为 10 条）。|

### 网页内容抓取

| 工具 | 返回类型 | 内容结构与要点 |
| --- | --- | --- |
| `WebPageContent` | `string` | 返回 Markdown/HTML 文本，头部会附上 `# 标题`、描述、URL、内容类型。<br/>- `mode=markdown`：使用 Turndown 转 Markdown，默认移除链接 URL/图片，可通过 `keepLink / keepImg` 保留。<br/>- `mode=raw`：返回匹配 `querySelector` 的 HTML 片段。<br/>- `findKeywords`：返回统计与匹配内容块（Markdown 模式含字符区间），并追加截断提示。<br/>- `begin/limit`：对正文截取后会附 `[原始内容长度: X, 显示范围: a-b]`。<br/>错误或无法获取时返回 `[错误] ...` 字符串。|

---

## 文件系统工具 (`file-system/*`)

> 这些工具依赖 `window.require('fs')`，即仅在 SiYuan 桌面端可用。所有长文本结果都通过 `saveAndTruncate` 写入缓存文件并返回摘要，以避免 LLM 负担。

### 只读/搜索类

| 工具 | 返回类型 | 内容结构 |
| --- | --- | --- |
| `TreeList` | `string` | 树状目录（含文件大小），超限时附存档链接。`depth=-1` 等价于最大 7 层。|
| `ReadFile` | `string` | 指定 `beginLine/endLine` 会返回区间内容；启用 `showLineNum` 时为 `N│ content` 格式，大文件附截断告警。|
| `FileState` | `Record<string, any>` | `{ path, size (人类可读), isDirectory, createdAt, modifiedAt, accessedAt, lineCount? }`；`lineCount` 仅对识别为文本的扩展名计算。|
| `SearchFiles` | `string` | 扁平列表 `1. relative/path (size)`，命中数超过阈值附“达到最大”。|
| `SearchInFile` | `string` | 包含每次命中行的上下文（前后 `contextLines` 行），带行号箭头。|
| `SearchInDirectory` | `string` | 按文件聚合的命中摘要，默认最多 20 个文件、每个 5 条命中。|
| `MarkitdownRead` | `string` | 运行 `markitdown` 把 `.docx/.pdf/.pptx/.xlsx/.html` 等转为 Markdown，返回：文件信息、临时输出路径、总字符数、截断范围以及正文片段。|

### 文件与目录写操作

| 工具 | 返回类型 | 内容结构 |
| --- | --- | --- |
| `CreateFile` | `string` | 成功信息：`文件创建成功: <绝对路径>`；相对路径会写入 `%TEMP%/siyuan_temp`。存在同名文件则报错。|
| `Mkdir` | `string` | `目录创建成功: <path>` 或 `目录已存在`。|
| `MoveFile` | `string` | `已移动: src -> dst`；跨盘时自动复制再删除。|
| `CopyFile` | `string` | `已复制: src -> dst`；支持递归。|

### 文件编辑工具组 (`fileEditorTools`)

| 工具 | 返回类型 | 内容结构 |
| --- | --- | --- |
| `BatchEdit` | `string` | 总结执行的多条操作（替换/插入/删除）及文件行数变化。所有行号基于原文件。|
| `ReplaceLines` | `string` | 汇报替换范围、原文与新内容。|
| `InsertLines` | `string` | 描述插入位置（before/after 的行号）、插入行数以及附近上下文。|
| `DeleteLines` | `string` | 列出被删除的行内容。|
| `ReplaceString` | `string` | 报告匹配方式（正则/普通）、替换次数、原/新字符串示例。未命中时返回“未找到匹配”。|

---

## 脚本执行工具组 (`script-tools`)

> 仅在桌面端 (`window.require` 可用且 `IS_IN_APP`) 时注册。所有工具默认 `ToolPermissionLevel.SENSITIVE` 且需要结果审批。

| 工具 | 返回类型 | 内容结构 |
| --- | --- | --- |
| `Shell` | `string` | 先把命令写入临时脚本（Windows 下含 UTF-8/禁色处理），执行后返回压缩过的 `[stdout]/[stderr]` 概览；完整输出被写入 `shell` 历史。错误会在 `error` 字段携带 `Shell execution error: ...`。|
| `Python` | `string` | 自动注入 UTF-8 输出设置并保存至临时文件，返回 `[stdout]/[stderr]` 摘要，失败时包含脚本路径与异常。|
| `JavaScript` | `string` | 在沙盒 `with (sandbox)` 中执行，返回 `console.log` 聚合；若无输出则返回 `代码执行成功，无输出`；`console.error/warn` 会分别列在 `Errors`/`Warnings` 段落。|
| `Pandoc` | `string` | 运行思源内置 `pandoc.exe`；默认命令为 `pandoc -s <file> --to markdown`，成功时返回 Pandoc stdout（通常是转换后的 Markdown），失败时在 `error` 中包含 stderr。|

---

## 思源笔记工具组 (`siyuan/*`)

### 笔记本与文档导航

| 工具 | 返回类型 | 内容结构 |
| --- | --- | --- |
| `listNotebook` | `DocumentSummary[]` (仅 notebook 级字段) | `{ id, name, dailynotePathTemplate }`。过滤掉 `closed=true` 的笔记本。|
| `getNotebook` | `DocumentSummary` | 同上，根据 `id` 或 `name`（可能重复）查询。找不到返回 `NOT_FOUND`。|
| `listActiveDocs` | `{ OpenedDocs: DocumentSummary[]; Editing: string[] }` | 读取当前 SiYuan UI 中“打开的页签”与“当前编辑文档 id 列表”。|
| `getDocument` | `DocumentSummary \| { docs: DocumentSummary[]; notFoundIds?: string[] }` | `docId` 单查或 `docIdList` 批量；批量模式会把没找到的 id 放到 `notFoundIds`。|
| `getParentDoc` | `DocumentSummary` | 利用 `path` 的倒数第二段查父文档；顶层文档会返回 `NOT_FOUND`。|
| `listSubDocs` | `Array<DocumentSummary & { children: ... }>` | 递归深度默认为 1，最大 7。结构类似 `{ id, ..., children: [...] }`。|
| `listSiblingDocs` | `DocumentSummary[]` | 通过父路径列出兄弟文档；依赖 `/api/filetree/listDocsByPath`。|
| `listNotebookDocs` | `DocumentSummary[]` (深度=1) 或 `(DocumentSummary & { children })[]` | `depth` > 1 时为森林结构。|
| `getDailyNoteDocs` | `DocumentSummary[]` | 支持 `atDate`（单日）或 `beforeDate/afterDate`（区间），可选 `notebookId` 过滤。|

### 内容读取/写入

| 工具 | 返回类型 | 内容结构 |
| --- | --- | --- |
| `getBlockMarkdown` | `string` | 指定 `blockId` 的 Markdown 正文，支持 `begin/limit`，超限附 `[原始内容长度: ...]`。需要结果审批。|
| `appendMarkdown` | `string` | 成功时返回固定文案 `添加成功`。写入失败在 `error` 字段描述。|
| `appendDailyNote` | `string` | 返回新建或复用的日记文档 `docId`。调用者需在回答中附 `[文档](siyuan://blocks/<docId>)`（见 rulePrompt）。|

### 检索与查询

| 工具 | 返回类型 | 内容结构 |
| --- | --- | --- |
| `searchDocument` | `DocumentSummary[]` | 根据 `name` 或 `hpath`（可选 `match`=`=`/`like` 与 `notebook` 过滤）。|
| `querySQL` | `Array<Record<string, any>>` | 直接返回 SQL 查询结果（数组，每行是字典），调用前会把 `_esc_newline_` 还原为换行。仅支持 `SELECT`，需要人工设置 `limit` 以免爆量。|
| `searchKeyword` | `KeywordSearchResult[]` | 调用 `/api/search/fullTextSearchBlock`，默认搜索常见块类型。返回结构含块、根文档、所属笔记本信息。|
| `sqlUsageHelper` *(目前未注册成工具组)* | `string` | `/plugins/sy-f-misc/prompt/sql-helper.md` 的完整 Markdown，用作 LLM 学习资料。|

---

## 自定义脚本工具组 (`custom-program-tools/*`)

| 工具组 | 返回类型 | 内容结构 |
| --- | --- | --- |
| 动态加载的 Python 工具 | `string` | 每个 Python 脚本暴露多个 function，运行时会把结果 JSON 化并写入 `saveAndTruncate('custom_<fn>')`。成功输出为 `formatToolResult(...)` 生成的文本，包含 "Custom Tool: <name>" 标头。脚本返回的原始 Python 对象会被 `json.dumps`，若脚本抛错则返回 `ERROR` 包含 `traceback`。|

> 这些工具只在桌面端加载，并需要提前缓存 (`createCustomScriptToolGroupsFromCache`)。所有工具默认 `permissionLevel=SENSITIVE` 且双审批。

---

## ToolCallScript (`toolcall-script/index.ts`)

| 工具 | 返回类型 | 内容结构 |
| --- | --- | --- |
| `ToolCallScript` | `string` | 在沙盒中执行用户提供的 JS/TS 片段。结果是按 `console.log/warn/error` 汇总的文本：主体输出 + `[Warnings]` + `[Errors]` 区块。脚本可调用 `await TOOL_CALL(name, args)`、`sleep(ms)`、`parallel(...)`。异常（脚本崩溃、超时、下游工具报错）会直接进入 `error` 字段。|

---

## 如何使用本表

1. 设计工具链或脚本前，先核对所需工具的“返回类型”和“内容结构”，按需转换类型或解析字符串。
2. 若工具返回纯字符串且带截断提示（如 TreeList、ReadFile 等），想要完整内容时，应转而读取 `saveAndTruncate` 生成的文件路径（日志里会给出）。
3. 对需要审批的工具（SENSITIVE + `requireResultApproval`），编排脚本时要预留失败路径，例如捕获 `ToolExecuteStatus.RESULT_REJECTED`。
4. 若新增工具，请在实现文件旁更新此文档，保持 LLM 认知一致。
