---
title: GPT 清理完成后的 MCP 选择与接入交接
created: 2026-10-30T21:40:10.1420850+08:00
consumed: false # Reader: set to true once you have read this. Questions about missing context go under "Clarifications".
---

## Assume Reader

面向没有原始对话的新 Agent，工作区为 `H:/SrcCode/SiYuanDevelopment/sy-f-misc`。留在 `refactor/gpt-tools-cleanup`，以包含本 handover 的最新文档提交为起点；功能源码基线是 `b4a05f9`，不是 main。

先读以下三个文件，不必重读整个会话：

1. `.dev/changes/26-10-29T22-54_gpt-tools-cleanup/gpt-tools-cleanup.TARGET-SPEC.md`：目标、不可破坏合同和验收责任。
2. `.dev/changes/26-10-29T22-54_gpt-tools-cleanup/gpt-tools-cleanup.PLAN.md`：已完成基线、当前 P3、问题状态及 Blocked by。
3. `.dev/changes/26-10-29T22-54_gpt-tools-cleanup/gpt-tools-cleanup.METHOD.md`：MCP 实测、官方控制机制、候选路线和代码入口。

**立即要点：清理已提交；MCP 只有临时探针，没有正式接入。用户尚未回答“原生组打开后初始全选还是不选”。先看最新用户输入是否已作答，不要把本次要求整理文档视为同意代理建议。**

## Source Session

仅供意外疑问或逐字核查的应急索引，正常工作不依赖它。

- Session：`C:/Users/EEG/.pi/agent/sessions/--H--SrcCode-SiYuanDevelopment-sy-f-misc--/2026-10-29T13-06-31-992Z_01a187c4-ebb8-7012-897a-67d03686d821.jsonl`
- Search anchors：`chat first`（产品定位与树/多版本）、`WORKSPACE_VERIFY_FAILED`（早期连接失败，后已解决）、`初始全选，还是初始不选`（最后未答复问题）、`先确认最小可行性`（等待指令，已执行完）。

## Background & User Guidance

最初任务是审查很早开发的 GPT/tools，后来收敛为先清理历史机制、再评估思源原生工具，而不是把聊天插件改成自主 Agent。

> 我本来就定位是 chat first , agent 2nd

tree / multi-version 不可牺牲。关闭工具只过滤发给模型的定义，按名执行仍允许，这是用户保留的设计；不要重新当漏洞修。

> 如果要接入 MCP 是不是需要安装外部依赖库？如果是这样那我就不太想要了。

零新增依赖已经实测可行，不要为“支持 MCP”引入 SDK/CDN 或通用客户端。完整 SKILL 系统仍是后续考虑；`read-rule` 只是过渡。

> 我们需要考虑，在纳入的时候怎么控制，是全部纳入，还是自己也设置一个开关的抽象层

这是待决问题，不是用户要求立刻新增控制层。代理建议复用现有组/单工具开关、原生组默认关闭、暂不拆 action，并倾向初始不选；这些建议尚未全部获准。

> 你如果有需要，可以在当前目录下配置把 dev 空间所有的 cli 权限打开，或者绕过直接用 网络请求，均可

这是开发验证许可，不是模型自动批准全部工具的许可。实际使用了直连已校验 dev 的方式，未主动修改 CLI 权限配置，也未直接读取/输出 token。

## Trajectory

1. **从全面审查收敛到清理（已实施）。** 用户指出变量系统是早期类 SKILL 探索，并强调 chat-first。未采用“新建 Agent 框架/永久结果仓库/全面权限重构”；相邻旧缺陷只保留范围记录，见 METHOD 末节。
2. **Git 与清理检查点（源码及自动检查通过）。** 先将 `feat/svg-text-assets` 合入 main（`32f7ad3`），再建立当前分支。`34c2ea1` 是初始规划，`b4a05f9` 是功能清理：read-rule、删除变量/VAR_REF/伪日志与失效元数据、schema 3.4、新生成原生消息、旧历史读取不变。新增 `tests/gpt-tools.test.ts` 的 11 项真实组件测试；总 115 项通过，双构建通过。宿主验收仍缺，类型/浏览器基线失败没有被粉饰，见 PLAN。
3. **官方控制与真实 MCP 调研（有限路线已证实）。** `12c7ca9` / `5e1b57f` 记录源码与运行证据。最初 dev 未启动导致实例校验失败；用户打开后校验成功。原生 fetch 在 dev 3.8.8 完成握手、清单、system.version 和会话关闭。实际 MCP 30 工具/168 枚举 action，模型定义约 64.6 KB。Agent 开关、MCP 暴露、连接远端 MCP 三套控制不同；对外暴露按整工具，不裁动作。
4. **停在选择门槛，不是停在可行性。** 最后问的是“打开该组后，初始全选，还是初始不选？”用户没有回答，改为要求整理最新版 PLAN/SPEC 并写 handover。当前文件已按 PLAN skill v3 整理：讨论、实现、宿主缺证据及两类基线阻碍分开，步骤/提交不再冒充问题。

## Current Status

- 写交接前 HEAD：`5e1b57f`；分支 `refactor/gpt-tools-cleanup`，仅一个 worktree。开始本轮文档整理前工作区干净。
- 本轮只完整整理三个 change 文档并新增本 handover，随文档检查点一起提交；未改 `src/`、依赖或权限文件。接手时用 `git status --short --branch` / `git log -5 --oneline` 确认最新文档提交，不要求 HEAD 仍等于上述旧值。
- main 仍停在 `32f7ad3`。没有推送、合并或删除当前开发分支。
- 本任务没有仍在执行的子代理、构建或探针；各 MCP 协议 session 均已 DELETE 关闭。不要续接旧 subagent ID，也不要关闭用户自己的 dev 思源进程。
- 用户要求的“可行后等到 04:15”已通过 wait 等至 **2026-10-30 04:15 +08:00**，随后继续过调研。**不要再等待或重做此前启动排查。**

## Pending and Next

1. **先关闭 PLAN [I11]。** 若新输入未回答，简短确认采用原生组方案时的初始选择：全选再删减，或初始不选自行勾选。代理倾向后者并保存全局默认，但不要擅自固定。若用户有新取舍/授权，以新回复为准，不机械重复提问。
2. **处理 [I14] 及 [I7] 首版边界。** 明确默认执行/结果审批、工具及结果类型、命名和刷新方式。已有元信息不足以自动判只读：30 工具无明确 readOnlyHint，98 个动作 effects 为空；MCP 也不继承原生 Agent 的审批 UI。内部工程细节自行查代码，只把实质风险/行为取舍交给用户。
3. 确认后更新 SPEC/METHOD，再展开 P4 的原生工具组切片。先读 METHOD 的耦合表，尤其 `tools/index.ts` 同步工厂、两个工具面板的异步可见性/默认值、同名覆盖、Provider Schema 转换。不能只做 fetch wrapper 就宣称已接入。
4. 保持结果经过现有 `tool-chain-result.ts` / `message-lifecycle.ts`，补选择、审批、错误/结果及版本回放回归。MCP 故障只影响该组，不建立第二套聊天历史。
5. [I8] 清理宿主验收可独立进行。没有确认用户宿主已加载哪份构建；打开 dev 空间不等于清理 UI 已验收。[I12]/[I13] 不应顺带修或标成通过。

## Key Information

- **最后一次运行记录，不是当前在线保证：** dev 3.8.8，当时 `http://127.0.0.1:4143`，项目文件选中 dev。后续调用先运行 `siyuan-cli current which`、`siyuan-cli workspace verify dev`、`siyuan-cli api system.version --print json`；端口会变，不硬编码产品，也不静默切换实例。
- CLI 当时为 0.17.0。请求缺凭证/实例失配时先解决目标/授权，不直接打印配置或 token。此 dev 无凭证请求成功不代表所有宿主都如此。
- 可选本机临时证据：`tmp/probe-siyuan-mcp-fetch.mjs`、`tmp/inspect-siyuan-mcp-schema.mjs`、`tmp/siyuan-mcp-schema-summary.json`；脚本目前写死旧端口，重跑前刷新目标。它们被 Git 忽略，不是产品实现或必要输入，METHOD 已保留可重建流程。
- 可选基线快照：`tmp/gpt-tools-baseline-34c2ea1/`。复核基线用隔离 git archive，不 stash/checkout 共享工作树。相关日志在 MSYS `/tmp/sy-f-misc-gpt-cleanup-*`；read 工具若要读它们，Windows 路径为 `G:/Enviroment/msys2/tmp/`。
- 可选上游缓存：`C:/Users/EEG/AppData/Local/Temp/sy-agent-upstream-review/`，文件名前缀 v388/v389。METHOD 的固定 tag URL 是持久依据；GitHub 之前 TLS 失败，不能将 Gitee master 误称为 GitHub HEAD。
- 不要因只测了 3.8.8 就顺手提高 `plugin.json` 的最低版本或扩建兼容平台；支持范围有实质变化时先与用户确认。
