# 验证结果

## 本轮：统一可见树与操作范围

旧单节点删除、clear/fromHistory 把 Solid store merge 当作替换，能够留下图外记录；这些写入入口在当前源码已修正，不自动清理已保存的数据。本轮取消“图外 parent 声明阻挡可见子树”的规则，树图和规划共用 root 沿 children 可达的图。

对用户提供的 20251027000751-mvjoah0.json 做只读载入，在真实 TreeModel 的内存副本中验证：2019 条存储记录中 133 条属于当前树；截图选区 9 条全部可复制/移除，保留 0 条。删除后可见树剩余 124 条，双向关系一致；1886 条图外记录原样保留。改变 active path、当前 version 和点击顺序不改变规划，复制保留全部版本。源文件前后字节一致。该验证不写入思源存储，也不等于应用内保存/重载验收。

根节点仍有独立安全边界：若整树删除会留下未选存储记录，保留实际 root，避免未经授权丢弃残留。历史清理/恢复不是本轮功能。

## 执行与范围

- 等待至 2026-10-04 06:45:00 +08:00 后开始实现；分支 `feat/gpt-subtree-response-compat`。
- 完成子树删除/剪切、三种既有协议的响应解析、按消息 version 归属的 usage/思维链展示。不实现 Responses API，不新增全局消耗统计。
- 协议实现由有界 worker 辅助，主 agent 审查了归一化/stream snapshot 契约，补充了已报告明细保留、未闭合 think 区段的可见错误提示及跨文件集成。
- 两次独立只读 review 分别覆盖子树和协议/version 集成。有效问题已修正：目标先保存、保存结果检查、空 system prompt、工具进度回调、读流失败保留部分结果、EOF 字符释放、工具 follow-up 版本归属、cache write alias。
- 主 agent 用官方 SDK 源码片段交叉核验了 Claude 缓存相加语义、Gemini total 的 thoughts/tool-use 分量及 OpenAI cache_write 字段。完整来源见 protocol-evidence.md。

## 最终命令

| 命令 | 结果 |
|---|---|
| `pnpm run test:gpt` | 通过：chat 31/31，protocol 42/42，总计 73/73 |
| `pnpm run test:gpt-tree-menu` | 正式 HTML 菜单、范围选择、影响图和 2000 节点回归通过；隐藏残留不再保留整个可见子树 |
| `pnpm run type-check` | 退出 2，仅未修改的 `src/func/docfile-tools.ts` 有 4 个既有错误；本次文件无类型错误 |
| `pnpm run build:publish` | 通过：Vite 发布构建与 ZIP 打包完成 |
| `git diff --check` | 通过 |
| world-tree HTML inline script `new Function(...)` | 语法检查通过 |

类型检查剩余错误：

- `src/func/docfile-tools.ts:315:37` — `unknown.dataset`
- `src/func/docfile-tools.ts:316:40` — `unknown.querySelector`
- `src/func/docfile-tools.ts:316:115` — `unknown.dataset`
- `src/func/docfile-tools.ts:328:77` — `unknown.dataset`

未为消除这些无关错误修改 docfile-tools。它相对 main 无 diff。

## 测试覆盖的关键行为

- 全部版本/usage 复制独立；安全剪切保留共享路径、未选分支和书签；多终点、整树、非当前分支删除。
- 中间节点与独占部分混选：明确预览后删除安全部分，公共路径保留；零可移除内容拒绝。图外残留不能限制完整可见子树。
- Solid store 真实清空/恢复，无孤儿 map 项；当前世界线只保留合法前缀。
- 剪切目标保存先于原树删除；整树剪切写入空原会话；目标/来源保存失败、UI 切换失败的回滚；持续存储失败时保留完整目标备份。
- rerun 不继承旧 usage/耗时/推理；流式和完成结果绑定准备时的 version，查看其他 version 不串写；模型标签保留请求时选择。
- 三种协议缓存/推理计数归一化，显式 0 与未知区分；缓存/工具/推理分量不重复加总；只保留各请求都报告的工具回合合计明细。
- SSE 任意字节分片（包括 UTF-8 中间）、CRLF、末尾无换行、最后仅 usage 的 chunk。
- reasoning 字符串/结构化详情、Gemini thought、Claude thinking；不展示 encrypted/signature，正文内合法嵌入标签不剥离。
- 工具参数纯 delta 的进度回调、不可回溯修改的工具快照；网络读流失败保留内容/usage；真实生成中取消和 pre-abort；未闭合 think 的错误在正文中可见；EOF 释放未完成标签的字面文本。

## 尚未验证

- 未连接用户的付费模型服务进行真实请求，未访问运行时密钥/私有配置。
- 未进行思源应用内视觉和交互验收，未实测真实设备同步或强制退出。待验收项见 manual-verification.md。
- 本次保证现有本地工作副本的有序提交与失败回滚，缓存仍异步复制；没有引入跨设备事务。中断可能保留两份完整内容，不承诺恰好一份。

本轮日志位于忽略目录：`tmp/gpt-rooted-graph-tests.log`、`tmp/gpt-rooted-graph-types.log`、`tmp/gpt-rooted-graph-browser.log`、`tmp/gpt-rooted-graph-build.log`。真实结构只读探针为 `tmp/gpt-rooted-real-case.ts`，不作为 CI 测试或可迁移夹具（依赖本地案例路径）。
