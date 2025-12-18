# 自定义脚本工具使用指南

## 概述

自定义脚本工具功能允许你通过编写 Python 脚本来扩展 GPT 工具的能力。你可以创建任何你需要的工具，比如：

- 数据处理和分析工具
- 文件格式转换工具
- API 调用封装
- 数学和科学计算工具
- 自动化任务脚本

## 快速开始

### 1. 创建脚本

将 Python 脚本（`.py` 文件）放入脚本目录：
- 思源笔记数据目录 `/snippets/fmisc-custom-toolscripts/`
- 可以通过设置页面的「打开脚本目录」按钮快速打开

### 2. 编写工具函数

每个公开的函数都会成为一个工具：

```python
"""
我的自定义工具模块

这里的文档字符串会成为工具组的说明
"""

def my_tool(arg1: str, arg2: int) -> dict:
    """
    工具的简短描述
    
    这里可以写详细的说明
    
    Args:
        arg1: 第一个参数的说明
        arg2: 第二个参数的说明
    
    Returns:
        返回值的说明
    """
    # 实现你的功能
    result = f"Processing {arg1} with {arg2}"
    return {"result": result}
```

**重要规则**：
- ✅ 使用类型注解（`arg: type`）定义参数类型
- ✅ 使用 docstring 描述功能和参数
- ✅ 公开函数（不以 `_` 开头）会被导出为工具
- ✅ 私有函数（`_private_func`）不会被导出

### 3. 权限配置（可选）

为函数设置权限属性：

```python
def sensitive_operation(data: str) -> str:
    """执行敏感操作"""
    # ... 实现 ...
    return result

# 设置权限级别
sensitive_operation.permissionLevel = 'sensitive'  # public, moderate, sensitive
sensitive_operation.requireExecutionApproval = True
sensitive_operation.requireResultApproval = False
```

**权限级别说明**：
- `public`: 无需审核，直接执行（默认）
- `moderate`: 首次需要用户确认，可记住选择
- `sensitive`: 每次执行都需要用户确认

**默认权限**（如果不设置）：
- `permissionLevel`: `sensitive`
- `requireExecutionApproval`: `true`
- `requireResultApproval`: `false`

### 4. 解析并导入

1. 打开插件设置页面
2. 切换到「自定义脚本」标签
3. 点击「重新解析并导入」按钮
4. 系统会自动：
   - 解析 Python 脚本
   - 生成工具定义（`.tool.json` 文件）
   - 加载工具到系统中

### 5. 启用和使用

1. 在「工具」标签页中找到「自定义脚本工具组」
2. 启用该工具组
3. 选择要启用的具体工具
4. 在 GPT 对话中，AI 就可以调用这些工具了！

## 支持的类型

### 基础类型
```python
str      # 字符串
int      # 整数
float    # 浮点数
bool     # 布尔值
```

### 复合类型
```python
from typing import List, Dict, Optional, Union, Literal

list[str]                    # 字符串数组
List[int]                    # 整数数组
dict                         # 对象
Dict[str, any]               # 键值对
Optional[str]                # 可选字符串
Union[int, float]            # 整数或浮点数
Literal["a", "b", "c"]       # 枚举值
```

## 完整示例

参考 `example_calculator.py`：

```python
"""
示例计算器工具模块

包含基础的数学运算功能。
"""

def add(a: float, b: float) -> float:
    """
    计算两个数的和
    
    Args:
        a: 第一个加数
        b: 第二个加数
    
    Returns:
        两数之和
    """
    return a + b

# 设置为公开工具，无需审核
add.permissionLevel = 'public'
add.requireExecutionApproval = False
```

## 最佳实践

1. **清晰的命名**：使用有意义的函数名和参数名
2. **详细的文档**：提供完整的 docstring
3. **类型注解**：始终使用类型注解
4. **错误处理**：使用 `raise` 抛出异常，系统会自动捕获
5. **安全意识**：
   - 避免执行危险的系统命令
   - 对敏感操作设置合适的权限级别
   - 验证输入参数的有效性

## 调试技巧

1. **使用 print**：输出会出现在工具执行结果中
2. **查看错误**：执行失败时会显示完整的 traceback
3. **测试独立运行**：先在 Python 环境中独立测试函数
4. **查看生成的 JSON**：检查 `.tool.json` 文件确认工具定义正确

## 常见问题

### Q: 我的函数为什么没有被导出？
A: 检查：
- 函数是否是公开的（不以 `_` 开头）
- 是否有类型注解
- 脚本是否有语法错误

### Q: 如何传递复杂的数据结构？
A: 使用 `dict` 或 `list` 类型，然后在函数内部解析：
```python
def process_data(config: dict) -> dict:
    name = config.get('name')
    options = config.get('options', [])
    # ...
```

### Q: 工具执行超时怎么办？
A: 默认超时是 30 秒。对于耗时操作：
- 优化算法减少执行时间
- 将大任务拆分成多个小工具
- 考虑使用异步或后台处理

### Q: 如何访问文件系统？
A: 可以使用标准库：
```python
import os
from pathlib import Path

def read_file(filepath: str) -> str:
    """读取文件内容"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()
```

### Q: 能否使用第三方库？
A: 可以！但需要确保这些库已安装在 Python 环境中：
```python
import numpy as np
import pandas as pd

def analyze_data(data: list[float]) -> dict:
    """使用 numpy 分析数据"""
    arr = np.array(data)
    return {
        "mean": float(np.mean(arr)),
        "std": float(np.std(arr))
    }
```

## 注意事项

⚠️ **安全警告**：
- 脚本在本地 Python 环境中执行，具有完整的系统权限
- 不要运行不可信的脚本
- 敏感操作务必设置 `sensitive` 权限级别

⚠️ **性能考虑**：
- 工具数量会影响 token 消耗
- 按需启用工具
- 避免创建功能重复的工具

## 更新日志

### v1.0.0 (2025-11-16)
- 初始版本发布
- 支持 Python 脚本解析
- 支持权限配置
- 提供设置页面管理界面
