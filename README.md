1. 搬运了我可常用的一些插件的代码，集成到了一个项目中
   - 去掉了当中我不需要的功能
   - 对我不习惯的交互方式进行了修改
2. 增加了一些自定义功能
3. 各个子功能可各自独立开启或关闭


## WebSocket 消息

- /api/broadcast/postMessage
- Message
```json
{
   "channel": "sy-f-misc",
   "message": "{{method}}{{payload}}"
}
```
