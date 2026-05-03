---
name: chat-options
created: 2026-05-03 00:36:23
status: DONE
attach-change: .sspec/changes/26-05-03T01-54_chat-options/spec.md
tldr: ''
---
<!-- MUST follow frontmatter schema:
status: OPEN | DOING | DONE | CLOSED
tldr: One-sentence summary for list views — fill this! -->

# Request: chat-options

## Background
<!-- Current situation, background information -->
src/func/gpt/ 提供了 AI 对话地功能，src/func/gpt/types.ts ..
也提供了良好的参数设置

## Problem
<!-- What is not working or missing -->
当前插件对 GPT 对话参数地管理，在一两年前还 OK，但是目前我注意发现用起来没那么好用了。

1. think type, think effort 参数，目前越来越重要；而当前地版本并不支持
2. tempeture 这些参数现在越来越不重要
3. 之前没有做好参数‘是否开关’地显示声明，而基本依赖某种隐式逻辑，例如 xxx=0 就 unset；参考 src/func/gpt/openai/ 中地实现
4. 各个模型的参数可能细微不同；比如 think effort, claude 是 high, max; GPT 是 low ... high, xigh

当前我在设置中，允许通过‘手动设置 JSON’做 override，但是还是不够

## Initial Direction
<!-- Your rough idea or preferred direction — details are fine but not required.
This becomes the starting point for the change's spec.md Approach. -->

我希望能这样：

- 允许明确指定 Option 是否开启；比如是否设置温度，top p 等；（对话过程中的设置 UI上）
- 把 reason effort 作为正式的参数中的一员对待
- 在 Provider 配置面板，可以给每个模型指定一套预设的 option 参数，并可选是否开启
- 对话界面中，能更方便的配置参数
- 考虑到不同模型参数配置可能细微不同，能支持某种 compact 的策略
- 扩展问题：默认支持 GPT 系？那么 Claude, gemini 类型的怎么处理？

也许可以参考 OpenCode 或者 Pi Coding Agent 的设计策略？
（允许使用 web access 等方式做网络调研分析）


## Relational Context
<!-- Constraints, preferences, related file links -->
- src/func/gpt/types.ts
- src/func/gpt/openai/complete.ts
  - src/func/gpt/openai/adpater.ts
- src/func/gpt/setting/ChatSetting.tsx
- src/func/gpt/setting/ProviderSettingV2.tsx
- src/func/gpt/chat/ChatSession/use-openai-endpoints.ts
- src/func/gpt/chat/main.tsx

---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILL + `sspec change new --from <this>`.

这个项目内容量比较大，可以灵活利用 rg, slsp 等分析代码。
建议你广泛阅读 src/func/gpt/ 下的源码理解当前的行为

不要盲目按照我上面的说法；因为我没有很好用语言表达出来我的不爽感
