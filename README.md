Frostime 个人自用工具箱代码。

- 通过 `/new` 新建附件文件
- 插入时间功能
- 标题链接功能
- 更改默认的 paste 样式
  - Zotero 笔记
- 暴露一些函数到 `globalThis` 下
  - `UniBlocks`, 用于 js-sql 查询中, 对父子块进行去重
- 中间点击打开小窗
- 侧边栏插件
- Run Js 残血版
- 文档伪面包屑
- 更换主题
- 转移引用
- 搜索语法

## 搜索语法

更改自简易搜索插件，但是去掉了无用的地方，并更改了语法。

- 搜索方法：开头指定 `/^:[wqrs]/`; w: keywords, q: query, r: regex, s: sql
- 类型过滤：`/^@[dhlptbsicmoOL1-6]+$/`
- 排除过滤：`/^-(.+?)/`
