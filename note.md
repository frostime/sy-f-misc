## 条件打包

存在一些个人需求和发布版需求有偏差的地方，就需要条件打包。

```
//#if [PRIVATE_ADD]
仅仅只有私人打包的时候才会添加的代码
//#endif
```

```
//#if [!PRIVATE_REMOVE]
私人打包的时候会删除，而发布版中会保留的代码
//#endif
```
