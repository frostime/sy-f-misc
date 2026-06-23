---
name: tool-call-message
created: 2026-06-20T16:30:38
status: DOING
kind: directive
attach-change: null
tldr: "新增 Standard 模式：工具调用 turn 以原生 IMessage[] 序列持久化与回放，废弃 Legacy 压缩；UI 分期改为 CodeX 式合并显示"
---

<!-- MUST follow frontmatter schema:
status: OPEN | DOING | DONE | CLOSED
tldr: One-sentence summary for list views — fill this! -->

# Request: tool-call-message

## Problem

当前插件的 GPT 功能中支持工具调用; @src/func/gpt/

但与业内常规做法不同的是，它每一次工具调用的整一轮 turn 都会被强行压缩到 prompt 当中，而不是把所有的工具调用结果完整保留。这是一个历史遗留问题，因为在过去需要考虑上下文的整理，但这种做法毕竟和业内整体做法不同，也带来了一定程度的不便。 @src/func/gpt/tools/toolchain.ts

请参考 SPEC DOC: .sspec\spec-docs\tool-call


## Initial Direction
<!-- Your rough idea or preferred direction — details are fine but not required.
This becomes the starting point for the change's spec.md Approach. -->

所以我的想法是改进兼容，支持业内通行的做法，相当于把它做成两种模式：
1. Legacy 模式：可以理解为一种自动压缩或自动整理的模式。
2. 新版模式：支持业内通行的做法。
（不一定使用这个名称，名称具体用啥需要再讨论）

在旧版本的 UI 当中只有 User 和 System 这两种格子，所以这意味着我们可能也要对 UI 做些调整，看具体要怎么做。

也许可以参考现今比较流行的各种 UI 方案（比如 CodeX 之类的）

一个顾虑和限制: {
这个插件的功能需求中，要能随意编辑 Cell 的对话文本，甚至可以添加新版本。

所以说，一个 对话单元 如果混合了多个的 Message 之类的话，那就会让这个功能变得很难分。

你可以看到在当前版本中，甚至额外增加了一个 userPromptSlice (src\func\gpt\types-v2.ts) 就是专门为了处理压缩工具结果、 reference 和实际的 instruction 输入的情况。

你可以调研相关代码树立一下情况，看看怎么搞。
}

## Success Criteria
<!-- Conditions that indicate the problem has been resolved and meets the user's intention -->
#TODO: 需要在 clarify 中讨论清楚新的边界行为和“什么叫成功”

---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL and cooperate with user.

由于代码较多，可以尝试灵活使用 asq,rg,fd,slsp 辅助
