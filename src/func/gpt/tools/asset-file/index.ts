/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-15
 * @Description  : Asset File Tools - 资源文件处理工具组
 * @FilePath     : /src/func/gpt/tools/asset-file/index.ts
 */
import { markitdownTool } from "./markitdown";

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');

/**
 * 资源文件工具组
 * 专门处理各种文档资源文件的读取和转换
 */
export const assetFileTools = {
    name: '资源文件工具组',
    tools: fs ? [
        markitdownTool,
    ] : [],
    rulePrompt: fs ? `
## 资源文件处理工具

### MarkitdownRead - 文档转换工具
**用途**: 读取 Word (.docx)、PDF (.pdf)、PowerPoint (.pptx)、Excel (.xlsx) 等文件，转换为 Markdown 格式
**参数**:
- path: 文件路径（必需）
- begin: 读取起始位置（字符索引，默认 0）
- limit: 最大字符数限制（默认 ${markitdownTool.DEFAULT_OUTPUT_LIMIT_CHAR}，设为 -1 不限制）W

**注意事项**:
- 需要系统安装 markitdown 工具 (pip install markitdown)
- 大文件建议分段读取（使用 begin 和 limit 参数）
- 转换过程可能需要一些时间，请耐心等待
`.trim() : ''
};
