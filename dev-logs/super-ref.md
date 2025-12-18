
## Super Ref

某个被指定为 SuperRef 的文档：

文档的属性 `custom-bind-super-ref-db`: 指向绑定的 SuperRef database
   1. block: database 的 id
   2. av: database 的 av id

存放 SuperRef 关系的 Database 块：
含有自定义属性 `custom-super-ref-db`: 指向文档的 id

## 动态数据库 (Dynamic Database)

通过自定义查询来动态更新数据库内容：

1. 在数据库块的菜单中选择 "设置动态数据库"
2. 输入查询语句 (SQl, 或者以 `//!js` 开头的 JavaScript， 需要返回块列表)
3. 点击确定保存设置

设置后，数据库块会具有自定义属性 `custom-dynamic-database`，存储查询语句。

通过数据库块菜单中的 "更新动态数据库" 选项可以执行查询并更新数据库内容。
