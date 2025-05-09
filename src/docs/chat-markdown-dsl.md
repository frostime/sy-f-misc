# Chat 对话记录 Markdown DSL 设计文档

## 概述

本文档描述了 Chat 对话记录与 Markdown DSL 之间的转换机制，该机制允许将结构化的聊天会话数据序列化为 Markdown 格式，并能够从 Markdown 文本中解析出原始的聊天会话数据。这种双向转换机制使得聊天记录可以方便地存储、分享和编辑。

## 数据模型

### 核心数据结构

- `IChatSessionHistory`: 表示一个完整的聊天会话
  - `id`: 会话唯一标识符
  - `title`: 会话标题
  - `timestamp`: 创建时间戳
  - `updated`: 更新时间戳
  - `items`: 消息项数组 (`IChatSessionMsgItem[]`)
  - `sysPrompt`: 系统提示信息
  - `preamble`: 前导文本（在第一个消息之前的文本）
  - `tags`: 标签数组

- `IChatSessionMsgItem`: 表示单个消息项
  - `type`: 消息类型，可以是 'message' 或 'seperator'
  - `id`: 消息唯一标识符
  - `message`: 消息内容 (`IMessage`)
  - `author`: 消息作者
  - `timestamp`: 消息时间戳
  - 其他元数据...

- `IMessage`: 表示消息的具体内容
  - `role`: 角色，可以是 'user', 'assistant' 或 'system'
  - `content`: 消息内容，可以是纯文本或包含图片的结构化内容

## Markdown DSL 格式

### 基本格式

每个聊天会话被格式化为一系列消息项，每个消息项使用以下格式：

```markdown
> ---
> <TAG_NAME attr1="value1" attr2="value2" />

消息内容...
```

其中：
- `> ---` 是消息项之间的分隔符
- `<TAG_NAME ... />` 是一个自闭合的 XML 标签，用于指定消息类型和属性
- TAG_NAME 可以是 SYSTEM, USER, ASSISTANT 或 SEPERATOR
- 标签可以包含属性，如 author, timestamp 等
- 标签后面是消息的具体内容

### 特殊元素

1. **系统提示 (System Prompt)**:
   ```markdown
   > ---
   > <SYSTEM />
   
   系统提示内容...
   ```

2. **用户消息**:
   ```markdown
   > ---
   > <USER author="username" timestamp="2025-05-07 14:01:32" />
   
   用户消息内容...
   ```

3. **助手消息**:
   ```markdown
   > ---
   > <ASSISTANT author="gpt-model-name" timestamp="2025-05-07 14:01:54" />
   
   助手回复内容...
   ```

4. **分隔符**:
   ```markdown
   > ---
   > <SEPERATOR />
   ```

5. **图片**:
   图片被包装在特定的 HTML 结构中：
   ```markdown
   <div style="display: flex; flex-direction: column; gap: 10px;">
   <img style="max-width: 100%; display: inline-block;" src="image-url" />
   </div>
   ```

6. **前导文本 (Preamble)**:
   在第一个分隔符 `> ---` 之前的任何文本都被视为前导文本。

## 转换机制

### 对象到 Markdown 的转换

转换过程由 `chatHistoryToMarkdown` 函数实现，主要步骤：

1. 处理前导文本（如果存在）
2. 处理系统提示（如果存在）
3. 遍历消息项数组，将每个消息项转换为 Markdown 格式
   - 对于普通消息，使用 `item2markdown` 函数
   - 对于分隔符，生成特定的分隔符标记
4. 合并所有转换后的文本

关键函数：
- `chatHistoryToMarkdown`: 将整个聊天历史转换为 Markdown
- `item2markdown`: 将单个消息项转换为 Markdown
- `formatSingleItem`: 格式化单个消息项的通用函数
- `adaptIMessageContent`: 处理消息内容，分离文本和图片

### Markdown 到对象的转换

转换过程由 `parseMarkdownToChatHistory` 函数实现，主要步骤：

1. 检测并提取前导文本
2. 按分隔符 `> ---` 分割 Markdown 文本
3. 处理每个分割后的部分，识别 XML 标签行
4. 解析每个部分的内容，构建消息项
5. 特殊处理系统提示和分隔符
6. 提取图片并构建结构化消息内容
7. 组装完整的聊天会话历史对象

关键函数：
- `parseMarkdownToChatHistory`: 将 Markdown 解析为聊天历史对象
- `parseItemMarkdown`: 解析单个消息项的 Markdown

## 实现细节

### XML 标签解析

使用正则表达式 `/>\s*<([A-Za-z]+)([^>]*?)(\s*\/?)>/` 解析 XML 标签，支持：
- 大小写混合的标签名
- 标签内的属性
- 标签结束前的空格（如 `<SYSTEM />`）

### 图片处理

1. **序列化**：图片被转换为特定的 HTML 结构
2. **反序列化**：通过识别特定的 HTML 结构和正则表达式提取图片 URL
