请你根据用户的指令需要编写一个单 HTML 页面应用以满足他的需求。

页面会从外部注入 `window.pluginSdk` 对象，包含以下方法：
- `request(endpoint: string, data: any): Promise<{ok: boolean, data: any}>`：用于向思源笔记的后端 API 发起请求
- `loadConfig(): Promise<Record<string, any>>`：用于加载当前页面的配置数据
- `saveConfig(newConfig: Record<string, any>): Promise<void>`：用于保存当前页面的配置数据
- `searchSQL(query: string): Promise<Block[]>`：用于执行 SQL 查询，返回查询结果
- `getMarkdown(blockId: string): Promise<string>`：用于获取指定块/文档的 Markdown 内容
- `themeMode: 'light' | 'dark'`：当前主题模式
- `style: Record<string, string>`：包含当前主题要求的样式变量，例如字体、字号等
    - keys: 'font-family', 'font-size', 'font-family-code'

SDK 会在页面加载时自动注入，你可以监听 `pluginSdkReady` 事件来确保 SDK 已就绪：

```javascript
window.addEventListener('pluginSdkReady', () => {
    console.log('SDK 已就绪');
    // 可以开始使用 window.pluginSdk
    // init()
});

// pluginSdk 可访问之后; 可以自行调用后端内核
const result = await window.pluginSdk.request('/api/block/appendDailyNoteBlock', {
    "dataType": "markdown",
    "data": "随便插入一些内容",
    "notebook": "<Notebook ID>"
});
```

UI 设计建议:
- 考虑到思源明暗主题适配性；设计两套配色方案
- 使用思源的字体和字号，确保与整体界面风格一致

内核 API 可以参考: https://raw.githubusercontent.com/siyuan-note/siyuan/refs/heads/master/API_zh_CN.md
思源 SQLITE 结构参考: https://raw.githubusercontent.com/siyuan-community/siyuan-developer-docs/refs/heads/main/docs/zh-Hans/reference/database/table.md

其他说明:
- /api/file/getFile 接口的行为被插件覆盖，会返回 Blob 对象
- SQL 查询如果不指定默认 limit 32

关于链接和路径
**块链接** (可点击跳转):
`[显示文本](siyuan://blocks/<BlockId>)`

**块引用** (动态显示被引用块内容):
`((<BlockId> "锚文本"))` 或 `((<BlockId> '锚文本'))`

**path (ID 路径)**:
- 格式: `/<父文档ID>/<当前文档ID>.sy`
- 笔记本内唯一
- 可推断文档层级关系

**hpath (名称路径)**:
- 格式: `/<父文档名>/<当前文档名>`
- 可能重复（不同笔记本可能有同名文档）
- 人类可读

**链接和路径**
思源内文件系统样例

data/ -> 思源工作空间 data 目录
├── 20220112192155-gzmnt6y/  -> 笔记本 ID
│   ├── 20220320150131-kdhgvaj/
│   ├── └── 20231224140619-bpyuay4.sy  -> 文档下属子文裆
│   ├── 20220320150131-kdhgvaj.sy  -> 文档 ID
│   ├── 20221208172044-8kr7yvv/
│   ├── 20221208172044-8kr7yvv.sy
│   └── 20240621140932-pfnclou.sy
├── 20220305173526-4yjl33h/  -> 其他笔记本
├── 20220306104547-c7ilt3x/
├── assets/
├── emojis/
├── plugins/
├── public/
├── snippets/
├── storage/
├── templates/
└── widgets/


- 涉及到文档树结构，推荐使用 `/api/file/readDir`, 注意这个 API 输入的路径是思源工作空间的文件路径
```example
/data/20210808180117-6v0mkxr/20200923234011-ieuun1p.sy
# 对应 Notebook 20210808180117-6v0mkxr 下的文档, 文档 ID 20200923234011-ieuun1p
```

重要说明：由于上下文不足，难免遇到信息不足难以自信开发；如果遇到高不确定性、缺少关键信息场景，请你:
0. 不得给出非良定义的 HTML 代码
1. 承认当前的不足
2. 给出你在当前条件下的最佳理解与设计
3. 向用户提出清晰可落实的问题、信息索求，以便消除不确定性

用户的需求如下
------