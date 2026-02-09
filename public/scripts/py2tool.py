# ========================= schema_logic ========================= #
import argparse
import importlib.util
import inspect
import json
import sys
import typing
from pathlib import Path
from types import NoneType, UnionType
from typing import get_args, get_origin

# from docstring_parser import parse
try:
    from docstring_parser import parse
except ImportError:
    raise ImportError(
        '请先安装 docstring-parser 库以使用此脚本。运行: pip install docstring-parser'
    )

# (确保你已经: pip install docstring-parser)


def _map_py_to_json_type(py_type: type) -> dict:
    """
    将 Python 类型注解映射到 JSON Schema 类型字典。
    (这个函数与我们之前的版本完全相同)
    """
    # 处理 Optional[T] 或 T | None
    origin = get_origin(py_type)
    if origin in (typing.Union, UnionType):
        args = get_args(py_type)
        non_none_args = [arg for arg in args if arg is not NoneType]
        if len(non_none_args) == 1:
            return _map_py_to_json_type(non_none_args[0])
        else:
            if non_none_args:
                return _map_py_to_json_type(non_none_args[0])
            else:
                return {
                    'type': 'string',
                    'description': 'Union type (defaulted to string)',
                }

    # 处理 Literal["a", "b"]
    if origin == typing.Literal:
        enums = get_args(py_type)
        enum_type = 'string'
        if enums and isinstance(enums[0], int):
            enum_type = 'integer'
        elif enums and isinstance(enums[0], float):
            enum_type = 'number'
        return {'type': enum_type, 'enum': list(enums)}

    # 处理 List[T] 或 list[T]
    if py_type == list or origin == list:
        args = get_args(py_type)
        if args:
            item_schema = _map_py_to_json_type(args[0])
            return {'type': 'array', 'items': item_schema}
        return {'type': 'array'}

    # 处理 Dict[K, V] 或 dict[K, V]
    if py_type == dict or origin == dict:
        return {'type': 'object'}

    # --- 处理基础类型 ---
    if py_type == str:
        return {'type': 'string'}
    if py_type == int:
        return {'type': 'integer'}
    if py_type == float:
        return {'type': 'number'}
    if py_type == bool:
        return {'type': 'boolean'}

    # --- 回退机制 ---
    if py_type == inspect.Parameter.empty or py_type == typing.Any:
        return {
            'type': 'string',
            'description': '(Type not specified, defaulted to string)',
        }

    return {
        'type': 'string',
        'description': f'(Unsupported type: {str(py_type)}, defaulted to string)',
    }


def generate_schema_from_function(func: typing.Callable) -> dict | None:
    """
    从一个函数对象（在运行时）生成 OpenAI Tool Schema。
    """

    # 1. 获取函数签名
    try:
        sig = inspect.signature(func)
    except (ValueError, TypeError):
        return None  # 无法处理的函数（例如某些内置函数）

    # 2. 解析文档字符串
    docstring = inspect.getdoc(func) or ''
    parsed_docstring = parse(docstring)

    func_description = parsed_docstring.short_description or ''
    if parsed_docstring.long_description:
        func_description += '\n' + parsed_docstring.long_description.strip()

    # 提取返回值信息用于 declaredReturnType
    declared_data_type = None
    if parsed_docstring.returns:
        return_type = parsed_docstring.returns.type_name
        return_desc = parsed_docstring.returns.description
        if return_type:
            declared_data_type = {'type': return_type.strip()}
            if return_desc and return_desc.strip():
                declared_data_type['note'] = return_desc.strip()

    # 添加返回值说明到函数描述中
    # if parsed_docstring.returns:
    #     return_type = parsed_docstring.returns.type_name or 'Unknown'
    #     return_desc = parsed_docstring.returns.description.strip() if parsed_docstring.returns.description else ''
    #     if return_desc:
    #         func_description += f'\n\nReturns:\n{return_type}: {return_desc}'

    param_descriptions = {
        param.arg_name: param.description for param in parsed_docstring.params
    }

    # 3. 遍历参数并构建 Schema
    schema_properties = {}
    required_params = []

    for name, param in sig.parameters.items():
        if name in ('self', 'cls'):
            continue

        is_required = param.default == inspect.Parameter.empty
        py_type = param.annotation

        origin = get_origin(py_type)
        if origin in (typing.Union, UnionType) and NoneType in get_args(py_type):
            is_required = False

        if is_required:
            required_params.append(name)

        param_schema = _map_py_to_json_type(py_type)
        param_schema['description'] = param_descriptions.get(name, '')

        if param.default != inspect.Parameter.empty:
            param_schema['default'] = param.default

        schema_properties[name] = param_schema

    # 4. 构建最终的 Tool Schema
    parameters_schema = {'type': 'object', 'properties': schema_properties}
    if required_params:
        parameters_schema['required'] = required_params

    tool_schema = {
        'type': 'function',
        'function': {
            'name': func.__name__,
            'description': func_description.strip(),
            'parameters': parameters_schema,
        },
    }

    # 添加 declaredReturnType（如果从 docstring 解析出来了）
    if declared_data_type:
        tool_schema['declaredReturnType'] = declared_data_type

    # 5. 提取权限配置属性（如果存在）
    # 支持新格式（executionPolicy, resultApprovalPolicy）和旧格式（permissionLevel, requireExecutionApproval, requireResultApproval）
    # 旧格式会被转换为新格式输出
    permission_config = {}

    # 新格式优先
    if hasattr(func, 'executionPolicy'):
        permission_config['executionPolicy'] = func.executionPolicy
    elif hasattr(func, 'permissionLevel'):
        # 旧格式转换：permissionLevel -> executionPolicy
        level = func.permissionLevel
        if level == 'public':
            permission_config['executionPolicy'] = 'auto'
        elif level == 'moderate':
            permission_config['executionPolicy'] = 'ask-once'
        elif level == 'sensitive':
            permission_config['executionPolicy'] = 'ask-always'
        else:
            permission_config['executionPolicy'] = 'ask-always'  # 默认最安全
    elif hasattr(func, 'requireExecutionApproval'):
        # 旧格式转换：requireExecutionApproval -> executionPolicy
        permission_config['executionPolicy'] = 'auto' if not func.requireExecutionApproval else 'ask-once'

    # resultApprovalPolicy 处理
    if hasattr(func, 'resultApprovalPolicy'):
        permission_config['resultApprovalPolicy'] = func.resultApprovalPolicy
    elif hasattr(func, 'requireResultApproval'):
        # 旧格式转换：requireResultApproval -> resultApprovalPolicy
        permission_config['resultApprovalPolicy'] = 'always' if func.requireResultApproval else 'never'

    # 将权限配置添加到 tool_schema（只包含新格式字段）
    if permission_config:
        tool_schema.update(permission_config)

    return tool_schema


# ========================= parse_files ========================= #


def import_module_from_path(file_path: Path):
    """
    使用 importlib 从文件路径动态导入模块。
    """
    try:
        module_name = file_path.stem
        spec = importlib.util.spec_from_file_location(module_name, str(file_path))
        if spec is None:
            print(f'  [!] 无法加载 {file_path} 的 spec', file=sys.stderr)
            return None

        module = importlib.util.module_from_spec(spec)
        # 将模块添加到 sys.modules，这样它在导入时可以找到自己
        sys.modules[module_name] = module
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module
    except Exception as e:
        print(f'  [!] 导入 {file_path} 失败: {e}', file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(
        description='将Python脚本转换为Tool定义的JSON Schema (使用 importlib 运行时分析)'
    )

    import os

    # option 1
    parser.add_argument(
        '--files', nargs='+', required=False, help='要处理的Python文件列表'
    )
    parser.add_argument('--dir', type=str, required=False, help='要处理的Python文件目录')
    parser.add_argument(
        '--with-mtime', action='store_true', help='在 JSON 中存储脚本的修改时间'
    )
    args = parser.parse_args()
    if not args.files and not args.dir:
        raise ValueError('必须提供 --files 或 --dir 参数之一。')
    files = args.files or []
    if args.dir:
        dir_path = Path(args.dir).resolve()
        if not dir_path.is_dir():
            raise ValueError(f'提供的路径不是目录: {dir_path}')
        py_files = list(dir_path.glob('*.py'))
        files.extend([str(f) for f in py_files])

    for file_path_str in files:
        file_path = Path(file_path_str).resolve()

        if not file_path.exists():
            print(f'文件不存在，跳过: {file_path}')
            continue

        print(f'--- 正在处理: {file_path.name} ---')

        # 1. 动态导入模块
        module = import_module_from_path(file_path)
        if module is None:
            continue

        # 2. 提取模块文档字符串
        module_doc = inspect.getdoc(module) or ''

        # 3. 遍历模块成员，查找函数
        tools = []
        for name, member in inspect.getmembers(module):
            # 必须是函数，且必须是在这个模块中定义的（而不是导入的）
            if inspect.isfunction(member) and member.__module__ == module.__name__:
                # 过滤掉私有/内部函数
                if name.startswith('_'):
                    continue

                print(f'  > 正在解析函数: {name}()')

                # 4. 为函数生成 Schema
                schema = generate_schema_from_function(member)
                if schema:
                    tools.append(schema)

        # 5. 构建与你同事脚本相似的输出结构
        tool_group = {
            'type': 'PythonModule',
            'name': module.__name__,
            'scriptPath': str(file_path),
            'tools': tools,
            'rulePrompt': module_doc,
        }

        # 如果指定了 --with-mtime，添加修改时间
        if args.with_mtime:
            tool_group['lastModified'] = int(
                os.path.getmtime(file_path) * 1000
            )  # 转换为毫秒

        # 6. 写入 JSON 文件
        json_file = file_path.with_suffix('.tool.json')
        try:
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(tool_group, f, indent=4, ensure_ascii=False)

            print(f'  ✅ 成功生成: {json_file.name}')
            print(f"     - 模块: {tool_group['name']}")
            print(f"     - 工具数量: {len(tool_group['tools'])}")

        except Exception as e:
            print(f'  [!] 写入 JSON 失败: {e}', file=sys.stderr)

        # 清理导入的模块
        del sys.modules[module.__name__]


if __name__ == '__main__':
    main()
