# Zotero 功能迁移指南

旧版 Zotero 功能依赖 Better BibTeX debug-bridge 和访问 token。新版改为：

- Zotero 官方 Local API：读取条目和笔记数据。
- sy-f-misc Zotero Bridge：读取 Zotero 当前选中的条目。

新版不再需要配置 debug-bridge token。

## 需要做什么

1. 升级到 Zotero v9+。
2. 在 Zotero 中启用 Local API。
3. 安装 `f-zotero-ext@frostime.github.io.xpi`。
4. 在 sy-f-misc 设置中打开 Zotero 配置，点击「检查连接」。
5. 确认 `Zotero 数据存储目录`仍是当前设备的本地 Zotero 数据目录。

## 安装 Bridge 扩展

1. 找到 `f-zotero-ext@frostime.github.io.xpi`。
   - 插件分发包内路径：`external/zotero-bridge/f-zotero-ext@frostime.github.io.xpi`
   - 或从项目 Release 下载同名文件。
2. 打开 Zotero：`Tools` → `Add-ons`。
3. 点击齿轮菜单，选择 `Install Add-on From File...`。
4. 选择 `.xpi` 文件并重启 Zotero。

## 检查连接状态

在 sy-f-misc 的 Zotero 设置中点击「检查连接」。

- Local API 和 Bridge 都成功：可以使用 `/cite` 引用和导入笔记。
- Local API 成功、Bridge 失败：Zotero 已运行，但 Bridge 扩展未安装或未启动。
- Bridge 成功、Local API 失败：Bridge 已启动，但 Zotero Local API 不可用。
- 两者都失败：确认 Zotero 已启动，并检查扩展安装状态。

## 旧配置处理

- 旧的 debug-bridge token 会保留在历史配置中，但新版不会再使用它。
- `Zotero 数据存储目录`继续按设备独立保存；多设备需要分别设置本地路径。
- Bridge 扩展自动更新暂不在本次迁移中处理，后续会作为独立任务调研。
