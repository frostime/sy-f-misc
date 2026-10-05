# 验证与宿主验收

## 自动验证

- `pnpm run test:gpt`：81/81，通过（chat/残留/提交 39，协议 42）。新增的 8 个测试保护分组、UTF-8 大小、可见树/版本保持、备份失败、来源变动及回滚。
- `pnpm run type-check`：退出 2，仅原有 docfile-tools.ts 的 4 个 unknown 类型错误；本轮文件无类型错误。
- `pnpm run build:publish`：Vite、HTML 复制、ZIP 打包通过，产物含 pages/chat-tree-residue.html。
- 正式 HTML 与真实父 realm 的审查 SDK 接口在隔离 Edge 中验证：分组关系图、正常树锚点、缺失记录、时间/模型/KB、全部版本切换、文本不作为 HTML 执行、取消、过期审查、备份失败及确认后清理通过。另用脱水后的真实结构检查 69 组和最大 496 节点组，关系图、节点列表完整，默认零勾选。平台 I/O 是模拟边界，不等于思源端到端测试。
- 用户提供的 20251027000751-mvjoah0.json 只读探针：1997 条存储记录，111 条正常树节点，1886 条图外记录，69 组，339 项结构异常，估算图外节点 JSON 730.0 KB。内存清理全部可清理组后剩余 111 条，正常树、全部版本及当前路径未变，源文件字节未变。

日志和临时探针在忽略目录：tmp/gpt-residue-tests.log、tmp/gpt-residue-types.log、tmp/gpt-residue-build.log、tmp/gpt-residue-ui.log、tmp/gpt-residue-real-case.log。UI 探针 tmp/run-residue-ui.mjs 使用虚构数据及已脱水的结构副本，不访问用户浏览器 profile、原始聊天正文或模型服务。真实结构探针 tmp/gpt-residue-real-case.ts 仅在内存构造清理结果，不调用真实持久化。

## 文件地图

- ChatSession/tree-residue.ts：只读报告、关系分组、结构异常、大小及清理快照。
- ChatSession/residue-cleanup.ts：完整永久备份先行、原始快照复核、本地保存和失败恢复。
- ChatSession/residue-review/index.ts：审查 revision、按需版本详情、iframe SDK。
- ChatSession/residue-review/chat-tree-residue.html：审查窗口和 SVG 关系图。
- main.tsx：菜单与来源 session/生成状态保护，接既有 saveToJson/saveToLocalStorage。
- use-chat-session.ts/applyTreeSnapshot：仅更新树和 updated，保留独立的删除历史记录。

## 待执行的思源内验收

先在虚构样例中操作；不要未经用户审查清理真实历史。

1. 更新完整新构建、重载插件，从当前对话菜单打开「检查残留与断链」。默认零勾选。
2. 检查分组数量、图中橙色残留/蓝色正常树锚点/缺失记录，以及实线 children、虚线 parent 声明；点击节点，核对时间、模型、KB 与全部版本内容。
3. 按 ID 或摘要搜索，确认可以定位组内匹配节点；「结构异常」可定位到关联图或仅检查的正常树问题。
4. 勾选一组，预览后取消，历史不变。再次确认，永久历史列表应先出现完整「残留清理前备份」，随后当前对话移除所选组及对应书签。
5. 重新打开当前对话，保存并重载插件，确认被清理组不恢复、正常树/版本不变。确认打开永久备份可以恢复完整原内容。
6. 审查期间编辑消息、切换版本/会话或启动生成，旧审查不得执行；重新检查后才能操作。
7. 核对 root 缺失、可见节点或当前路径引用的组被禁止清理；无关断链不被偷偷修复。
8. 大组（例如 496 个节点）在真实宿主中可滚动/缩放、适应窗口，节点表与详情能够审查；暗色和窄窗口布局正常。

实现分工：辅助 agent 仅负责纯检测/清理快照模块及对应 4 个测试；宿主提交、菜单、UI、整体验证由主 agent 完成。

未自行部署，未真实清理用户数据；设备同步与强退仍属于既有异步缓存边界，未进行实机验证。
