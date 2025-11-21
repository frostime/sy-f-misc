"""
示例计算器工具模块

这个模块演示了如何创建自定义的 Python 工具供 GPT 使用。
包含基础的数学运算功能。
"""

from typing import Union


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


def multiply(x: float, y: float) -> float:
    """
    计算两个数的乘积

    Args:
        x: 第一个乘数
        y: 第二个乘数

    Returns:
        两数之积
    """
    return x * y


def factorial(n: int) -> int:
    """
    计算正整数的阶乘

    Args:
        n: 要计算阶乘的正整数（必须 >= 0）

    Returns:
        n 的阶乘值
    """
    if n < 0:
        raise ValueError('n must be non-negative')
    if n == 0 or n == 1:
        return 1
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result


# 设置函数的权限级别
# 加法和乘法是安全的，设置为 public
add.permissionLevel = 'public'
add.requireExecutionApproval = False

multiply.permissionLevel = 'public'
multiply.requireExecutionApproval = False

# 阶乘可能计算量大，设置为 moderate 需要首次确认
factorial.permissionLevel = 'moderate'
factorial.requireExecutionApproval = True


def power(base: float, exponent: float) -> float:
    """
    计算幂运算

    Args:
        base: 底数
        exponent: 指数

    Returns:
        base 的 exponent 次方
    """
    return base**exponent


# power 也是相对安全的操作
power.permissionLevel = 'public'
power.requireExecutionApproval = False
