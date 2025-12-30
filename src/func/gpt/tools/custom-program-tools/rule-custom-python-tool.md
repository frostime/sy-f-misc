## Python 自定义工具脚本规范

### 基本结构

```python
"""模块级文档字符串，用作工具组的 rulePrompt"""

import os

# 环境变量配置
API_KEY = os.getenv('YOUR_API_KEY')

def _internal_helper():
    """私有函数，以 _ 开头，不会被导出为工具"""
    pass

def my_tool(param1: str, param2: int = 10) -> dict:
    """工具简介（必需）

    详细说明工具的功能和用途。

    Args:
        param1 (str): 第一个参数说明（必需）
        param2 (int): 第二个参数说明，默认值 10（可选）

    Returns:
        dict: 返回值类型说明
            包含以下字段：
            - key1 (str): 字段说明
            - key2 (int): 字段说明

    """
    return {"key1": "value", "key2": param2}

# 权限配置（可选）
my_tool.permissionLevel = "moderate"  # public | moderate | sensitive
my_tool.requireExecutionApproval = True
my_tool.requireResultApproval = False

# 格式化函数（可选）
# 用于将结构化数据转换为人类可读的文本
my_tool.format = lambda result, args: (
    f"工具返回: key1={result['key1']}, key2={result['key2']}"
)
```

### 返回值要求

✅ **支持的类型**：`str`, `int`, `float`, `bool`, `dict`, `list`, `None`

❌ **禁止**：
- 不要返回 `tuple`（会被序列化为 array）
- 不要返回多个值（使用 dict 包装）
- 不要返回不可序列化的对象（如 file, socket）

### 格式化机制

当工具返回复杂的结构化数据时，可以定义 `.format` 函数将其转换为文本：

```python
def get_weather(city: str) -> dict:
    return {"city": city, "temperature": 25, "condition": "晴朗"}

# 格式化函数：(result, args) -> str
get_weather.format = lambda result, args: (
    f"{result['city']}的天气{result['condition']}，"
    f"温度{result['temperature']}摄氏度。"
)
```

**执行流程**：
```
工具返回 → {"city": "北京", "temperature": 25, ...}
         ↓ (format 函数)
格式化文本 → "北京的天气晴朗，温度25摄氏度。"
         ↓
返回给 LLM
```
