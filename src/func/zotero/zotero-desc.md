从 Zotero 中导入一些数据；默认 Zotero V7 版本

1. 前置条件：使用 zotero debug bridge 绑定 zotero (debug-bridge >= 1.0)

    1. [https://github.com/retorquere/zotero-better-bibtex/releases/tag/debug-bridge](https://github.com/retorquere/zotero-better-bibtex/releases/tag/debug-bridge)
    2. 详情参考「文献引用」插件中对 Debug Bridge 的介绍，本插件采用和这个插件一样的连接方式
2. 需要在设置中配置连接的密码 ； 这里 CCT 只是例子；设置密码之后别忘了在插件设置中也填上密码

    ```js
    Zotero.Prefs.set("extensions.zotero.debug-bridge.token","CTT",true);
    ```
3. `/cite` 触发功能

    1. 功能：引用选中的 Zotero 论文条目
    2. 功能：将选定论文的笔记导入到思源中

        注意，zotero 笔记中的图片默认只会以 `file:///` 链接的形式插入到笔记中；你可以在思源文档中自行将「网络资源图片转换到本地」，来将这些图片导入到思源当中
