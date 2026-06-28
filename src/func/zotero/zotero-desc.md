从 Zotero v9+ 导入选中条目和笔记。

## 功能

- `/cite`：引用 Zotero 当前选中的论文条目。
- `/cite`：导入 Zotero 当前选中条目的笔记。
- 粘贴 Zotero 标注链接时，自动简化为更适合思源阅读的链接格式。

## 前置条件

1. 启动 Zotero v9+。
2. 在 Zotero 中启用 Local API。
3. 安装 sy-f-misc Zotero Bridge 扩展。
4. 在本插件设置中点击「检查连接」，确认 Local API 和 Bridge 都可用。

Bridge 扩展只负责读取 Zotero 当前选中的条目；标准数据读取使用 Zotero 官方 Local API。

## 安装 Bridge 扩展

1. 找到 `f-zotero-ext@frostime.github.io.xpi`。
   - 插件分发包内路径：`external/zotero-bridge/f-zotero-ext@frostime.github.io.xpi`
   - 或从项目 Release 下载同名文件。
2. 打开 Zotero：`Tools` → `Add-ons`。
3. 点击齿轮菜单，选择 `Install Add-on From File...`。
4. 选择 `.xpi` 文件并重启 Zotero。

## Zotero 数据存储目录

`Zotero 数据存储目录`用于把 Zotero 笔记中的图片路径转换为 `file:///` 链接。

在 Zotero 中查看路径：`设置` → `高级` → `数据存储目录`。

该配置按设备独立保存；多设备使用时，每台设备都需要设置自己的本地路径。

## 笔记图片

Zotero 笔记中的图片默认以 `file:///` 链接插入思源。需要真正导入思源资源库时，可以在思源中使用「网络资源图片转换到本地」。

## 迁移

旧版本依赖 Better BibTeX debug-bridge 和 token。新版本不再需要 token；如从旧版本升级，请查看 `zotero-migration.md`。
