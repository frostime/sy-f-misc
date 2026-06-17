---
name: quick-input
created: 2026-06-18T01:18:25
status: OPEN
kind: directive
attach-change: null
tldr: ""
---

<!-- MUST follow frontmatter schema:
status: OPEN | DOING | DONE | CLOSED
tldr: One-sentence summary for list views — fill this! -->

# Request: quick-input

## 需求

我需要一个能快速在思源笔记特定位置开启输入的方案。避免手动翻阅找到需要插入新内容的地方。
需要创建一个新的 func module 来增加新的功能。

## 用户视角的 UX 方案如下

首先是配置模板 := {
  用户可以配置模板，这个模板代表在软件中某个地方自动创建一个文档或者块，并执行用户希望的一些操作（例如直接打开）。

  这个配置可以包含丰富的选项，比如：
  1. 最简单的：在特定的目录下创建一个文档
  2. 动态生成：根据一个预定义的 SQL 查询做动态生成
  3. 允许用户在使用的时候输入一些字段。
}

然后是一个打开方案 := {
需要在全局注册某个快捷键，通过该快捷键发起一个面板。在面板中，只要点击按钮就可以快速创建用户想要的信息。

在使用这个模板时，用户可以输入一些信息，或者让预定义的规则自动查询一些信息出来
}

### 一个可能的技术方案草案

> [!warning]
> 仅仅作为一个技术草案，需要对这个方案做梳理，最终给出一个符合用户需求的最简洁优化的技术框架
> 同时，函数、类型、接口的命名也不一定按照这个来，参考业内类似任务需求的最佳实践模式设计

---

- 配置 INewInputTemplate，这定义了用户将在什么地方、使用什么预定义模板开启输入
- 编写 HSPA Page 配置管理页面 (不一定，看 SOLIDJS 是否会更简单？或者 HSPA 更简单？)

  - 包含所有模板的按钮
  - 点击可以编辑方案
  - 可以添加新的 Input Template
  - HSAP 的设计应该简洁，最外层看上去仿佛只有一堆 Template 按钮，点击就能开启输入
- 编写 SolidJS 轻量级快速输入组件

  - 设计应该简洁，最外层看上去仿佛只有一堆 Template 按钮，点击就能开启输入
  - 如果有 declaredInputVar 需要用户输入，可以利用 src/libs/components/simple-form.tsx；输入预定义的变量
  - 执行：各种变量渲染，得到要插入的位置、计算要插入的预定义模板，创建 Block ，执行 hook script，并 openBlock
- 注册快捷键 Alt + I；呼出一个 Dialog ，用来快速输入
- 模板引擎
  - 复杂：使用 src/external/squirrelly.js ；请使用 await import('@external/xxx') 方便，方便 vite-plugin-external-modules.ts 处理 external 动态加载
  - 简单：直接手动处理

---

请参考： .sspec/tmp/input-template-type-draft.d.ts
注意其中 Block, NotebookId 都是已经在工作空间定义过的类型

---

在这个方案下，插入过程:

INewInputTemplate
⬇️
var = IBasicVar
⬇️
用户输入 ➡️ declaredInputVar (作为渲染模板的变量) 合并进入 var 得到 IMidVar
插入哪里： 计算 InsertToTemplate (document 类型 hpath 使用 IMidVar 计算渲染) ➡️ 得到 InsertToAnchor ➡️ 确定 root doc 和 anchor block，得到 ITemplateVar
⬇️
执行 preExecuteScripts，注入 ctx: ITemplateVar 作为变量; 得到的结果合并进入 ctx 当中 (动态计算)
⬇️
插入什么：使用 ctx 计算渲染 INewInputTemplate['template']
⬇️
调用 Kernel API 插入
⬇️
调用 postExecuteScript


### 期待的使用效果案例

**案例一**

用户定义模板方案如下：

- insertTo => Document
- 指定在 notebook xxx 下，创建新的文档
- 文档的路径为 `/开发ISSUE/{{year}}-{{month}}-{{day}} {{title}}`
- 在方案中还定义了 declaredInputVar

  - `title`: text
  - `type`: enum 类型，可选为 "新功能", "改进", "BUG"
- 指定了文档模板大致如下

  ```md
  标题: {{title}}
  类型: {{type}}
  状态: **准备中** | 实施中 | 完成 | 放弃
  ---

  ```

配置方案完成之后。某天，用户唤出快速输入对话框，并选择该方案。

1. 由于有 declaredInputVar，需要唤起一个 simple-form 让用户填写必要的输入模板
2. 根据模板，找到了需要插入的位置，确定了文档路径等
3. 由于没有定义 script ；所以直接渲染文档 markdown template 内容，
4. 调用内核 API 创建文档，插入进去预定义内容
5. 调用 openBlock 打开对应位置让用户编辑

**案例二**

用户定义模板方案如下：

- insertTo => block 类型

  - anchorGenerator 为一段 SQL 代码
  - 按照 append 方案
- 无 declaredInputVar
- 有一个 preExecuteScript
- 定义 template

  ```md
  {{year}}-{{month}} : 本月编辑文档数量 {{count}} 个
  ```
- openBlock: false

配置方案完成之后。某天，用户唤出快速输入对话框，并选择该方案。

- 首先执行了 SQL 检索，这个检索返回了一个 Block ，是的某个用户定义的汇总当前月记录 Heading 块

  - 这样也就确定了内容要插入到哪里
- 执行 preExecuteScript ，返回了一个 Promise<{ count: number;  }>
- 现在渲染 template 内容；template var 中已经包含了刚刚获取的 count
- 执行插入内容到对应位置；但是不用打开对应 block

## Success Criteria
<!-- Conditions that indicate the problem has been resolved and meets the user's intention -->

从用户视角看，能更方便实现无压输入；以后只需要 Alt + I 快捷键，然后点击预设配置就 OK 了


---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL and cooperate with user.

本次 clarify 方案步骤中:

1. 重点要和 User 对齐清楚，到底底层实际的需求是什么？用户在这次过程中，更关注“功能行为”以确保能满足他想要的需求。
2. 不要无脑接受给出的初版提案；需要思考，给出的草案是否呼应了问题？是否过度建模？是否有更加 KISS/YAGNI 的解决方案？
3. Clarify 过程中，必须要真正思考问题给出你的增量意见；不能装模作样思考几番，然后无脑给用户问一些本质是把用户的意见包装一番，问你是否同意 —— 这种做法是纯粹的形式主义，没有任何价值。
4. 后续 Deisgn 过程中，务必磋商具体的模块程序架构；在这个阶段需要参考相关的 "architecture-design" SKILL (hidden, 需要 view-skill with filter 检索到)
