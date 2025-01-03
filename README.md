
## Preliminary

1. **介绍说明：** 本插件集成了多种个人常用的功能，少部分功能迁移自其他插件。本人此前发布的一些不少插件就拆分自本插件的子功能模块（例如 Bookmark+, QueryView, 文档上下文等）
2. **免责声明：** 本插件为个人自用，不保证任何意义上的稳定性

    1. **无国际化：** 本插件仅为个人使用，暂不考虑多语言支持
    2. **可能存在硬编码：** 插件内部可能存在一些硬编码的变量，例如个人笔记本 ID 等
    3. **平台适配差：** 本插件主要为思源本地 Electron 应用设计，未针对其他系统、服务器模式或移动端进行特别适配，可能存在兼容性问题
    4. **缺少使用文档**：本人没有精力也没有动力去写详细的使用说明文档

请用户在使用前仔细阅读以上说明，并根据自身需求进行评估决定是否使用。

1. **Introduction**: This plugin integrates several personally used functions, with a small portion of features migrated from other plugins. Some of my previously released plugins were actually extracted from sub-modules of this plugin (such as Bookmark+, QueryView, Document Context, etc.).
2. **Disclaimer:**   This plugin is for personal use and does not guarantee stability in any sense.

    1. **No Internationalization:**   This plugin is intended for personal use only, and multilingual support is not currently considered.
    2. **Potential Hardcoding:**   The plugin's internal code may contain hardcoded variables, such as personal notebook IDs.
    3. **Weak Platform Support:**   This plugin is primarily designed for the local Electron application of SiYuan, and it has not been specifically adapted for other systems, server modes, or mobile devices. Compatibility issues may arise.
    4. **Lack of user documentation:**  I don't have the effort and initiative to write detailed user manuals.

Please carefully read the above instructions before using the plugin, and evaluate whether it meets your needs before deciding to use it.

此前，本人已经开发了很多插件并上架到了集市。这些插件大多是根据我自己的需求，在这个自用插件中开发，在后续的使用过程中觉得还不错，就拆分成独立的插件上架给大家使用。集市中至少有六七个插件是拆分自本插件，包括书签+、QueryView 等较为复杂的插件。

然而拆分插件的工作量很大，而且需要同步维护，还要考虑文档和国际化等问题。考虑到个人的时间和精力，本人可能不太有动力再重复这样的工作流程了。因此，也欢迎有能力的开发者帮助我拆分和迁移功能。如果开发者对本插件中的特定子功能感兴趣，欢迎在遵守 **GPL-v3 开源协议**的前提下，自行进行功能迁移和独立开发。

In the past, I have developed many plugins and published them on the Marketplace. These plugins were mostly developed based on my own needs within this personal plugin. If they felt good to use, I later split them into independent plugins for public use. At least six or seven plugins currently on the Marketplace are derived from this plugin, including some complex ones like Bookmark+ and QueryView.

However, splitting up plugins takes a lot of effort, and requires synchronized maintenance, as well as considering documentation and internationalization. Given my limited time and energy, I am unlikely to have the motivation to repeat this process in the future. If any developer is interested in specific sub-functions within this plugin, you are welcome to migrate and develop them independently, provided that you adhere to the **GPL-v3 open-source license**.

---

## 目前的功能概览

* GPT 对话

  * 在思源内创建独立的对话界面
  * Provider、Model、Prompt 管理
  * 支持快速将选中文字添加到对话中
  * 将对话内容保存到思源笔记中
* Toggl

  * 一个简易的 Toggl 客户端
  * 定期将 Toggl 的 Time Entries 插入到 Daily Note 中
* 侧边栏显示块

  * 迁移自侧边显示插件，调整了使用方式
  * 允许在侧边栏显示 Protyle 编辑器
* 迁移引用

  * 将反向链接块迁移到同一笔记本中
* Zotero 工具

  * 引用选中的 Zotero 论文条目
  * 将选定论文的笔记导入到思源中
* 自定义 CSS 文件

  * 在 public 目录下创建一个 custom.css
  * 用户可以在本地用编辑器编辑 custom.css
  * 本质和代码片段区别不大，不过如果用代码编辑器编写体验自然会更好
* 中间小窗 (已拆分上架)
* 文档上下文 (已拆分上架)
* Insert Time  (已拆分上架)
* 更换主题 (已拆分上架)
* Titled Link（已拆分上架）
* ~~Bookmark+（拆分上架并从本插件中删除）~~
* ~~QueryView（拆分上架并从本插件中删除）~~
* 新建空白附件: 在思源中快速创建空白的 Markdown（.md）、文本文件（.txt）、Word 文档（.docx）等
* Quick Draft: 模仿快速卡片写作插件，快速创建独立的编辑窗口（主要当草稿用）

  * 会全局注册 Alt + Shift + G 快捷键
* Webview 网页视图: 在新窗口中打开 Webview，模仿自其他插件
* 全局 Paste 处理：自定义粘贴事件，例如在粘贴 URL 文本时自动转换为链接等
* WebSocket：这个是纯个人使用的工具；主要和 quicker 配合使用

其他还有一些不那么重要的功能，不再一一赘述。

## 开发者说明

> 和插件的使用无关，是本人在插件开发的时候积累的一些小玩具，可能对插件开发有些帮助

1. 本插件主要使用 solidjs 框架开发，这是一个比 react 更加优雅的响应式框架，轻量级且高性能

    你可以使用这个模板来创建一个基于 solidjs 的插件 [https://github.com/frostime/plugin-sample-vite-solidjs](https://github.com/frostime/plugin-sample-vite-solidjs)

    或者使用这个 cli 工具快速创建 [https://www.npmjs.com/package/siyuan-plugin-cli](https://www.npmjs.com/package/siyuan-plugin-cli)
2. 插件的很多公有的工具性的代码，被我抽离到一个独立的工具包中，一定程度上可以减轻插件开发的复杂度

    [https://www.npmjs.com/package/@frostime/siyuan-plugin-kits](https://www.npmjs.com/package/@frostime/siyuan-plugin-kits)

‍
