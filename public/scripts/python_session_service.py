"""
Python Session Service

一个基于 FastAPI 的 Python 远程执行服务。
使用 code.InteractiveInterpreter 实现，支持多 session 管理、代码执行、变量查询等功能。

Usage:
    设置环境变量:
        PYSESSION_TOKEN: 认证 token（必填）
        PYSESSION_PORT: 服务端口（默认 8000）
        PYSESSION_WORKDIR: 默认工作目录（可选）
        PYSESSION_EXEC_TIMEOUT: 执行超时秒数（默认 30）

    启动服务:
        python python_session_service.py

API:
    POST /v1/session/start              - 创建新 session（可指定 workdir）
    GET  /v1/session/{id}/info          - 获取 session 信息
    POST /v1/session/{id}/exec          - 执行代码
    GET  /v1/session/{id}/vars          - 列出变量
    POST /v1/session/{id}/vars/get      - 获取指定变量
    POST /v1/session/{id}/reset         - 重置 session
    DELETE /v1/session/{id}             - 关闭 session
    GET  /v1/sessions                   - 列出所有活跃 sessions

Changes from v1 (IPython-based):
    - 使用 code.InteractiveInterpreter 替代 IPython.InteractiveShell
    - 支持多个并发 session（不再受 IPython 单例限制）
    - 每个 session 有独立的虚拟工作目录（workdir）
    - 注入 cd(), pwd() 辅助函数供代码使用
"""

from __future__ import annotations

import ast
import asyncio
import io
import os
import shutil
import sys
import threading
import traceback
import uuid
from code import InteractiveInterpreter
from contextlib import contextmanager, redirect_stdout
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path as PathlibPath
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# =============================================================================
# 配置
# =============================================================================

TOKEN_ENV = 'PYSESSION_TOKEN'
PORT_ENV = 'PYSESSION_PORT'
WORKDIR_ENV = 'PYSESSION_WORKDIR'
TIMEOUT_ENV = 'PYSESSION_EXEC_TIMEOUT'


@dataclass(frozen=True)
class ServiceConfig:
    """服务配置（不可变）。"""

    token: str
    port: int
    workdir: str
    exec_timeout: int

    @classmethod
    def from_env(cls) -> ServiceConfig:
        """从环境变量加载配置。"""
        # Token（必填）
        token = os.getenv(TOKEN_ENV)
        if not token:
            print(f'[FATAL] Missing env {TOKEN_ENV}', file=sys.stderr)
            raise SystemExit(1)

        # 端口
        port_str = os.getenv(PORT_ENV, '8000')
        try:
            port = int(port_str)
        except ValueError:
            print(f'[FATAL] Invalid {PORT_ENV}={port_str}', file=sys.stderr)
            raise SystemExit(1)

        # 工作目录
        workdir = os.getenv(WORKDIR_ENV, os.getcwd())
        if not os.path.isdir(workdir):
            print(f'[FATAL] Invalid {WORKDIR_ENV}={workdir}', file=sys.stderr)
            raise SystemExit(1)

        # 超时时间
        timeout_str = os.getenv(TIMEOUT_ENV, '30')
        try:
            exec_timeout = int(timeout_str)
        except ValueError:
            print(f'[FATAL] Invalid {TIMEOUT_ENV}={timeout_str}', file=sys.stderr)
            raise SystemExit(1)

        return cls(token=token, port=port, workdir=workdir, exec_timeout=exec_timeout)


# 全局配置实例
CONFIG = ServiceConfig.from_env()

# 切换到工作目录
os.chdir(CONFIG.workdir)


# =============================================================================
# Python Session 核心类
# =============================================================================

# 需要过滤的内部变量
_HIDDEN_VARS: set[str] = {
    '__name__',
    '__doc__',
    '__package__',
    '__loader__',
    '__spec__',
    '__builtins__',
    '__file__',
    # 注入的辅助函数
    'cd',
    'pwd',
    'ls',
    'cat',
    'mkdir',
    'touch',
    'rm',
    'cp',
    'mv',
    'write',
    'exists',
    'isfile',
    'isdir',
    'abspath',
    '_session_workdir',
    '_session_cd',
    '_session_pwd',
}


@dataclass
class ExecutionResult:
    """代码执行结果。"""

    ok: bool
    stdout: str
    stderr: str
    result_repr: Optional[str] = None
    error: Optional[dict[str, Any]] = None
    timed_out: bool = False
    execution_count: int = 0


@dataclass
class HistoryEntry:
    """历史记录条目。"""

    execution_count: int
    code: str
    stdout: str
    stderr: str
    result_repr: Optional[str] = None
    error: Optional[dict[str, Any]] = None
    ok: bool = True


@dataclass
class VarInfo:
    """变量信息。"""

    name: str
    type_name: str
    repr_str: str


# 用于保护 os.chdir 的全局锁（因为 cwd 是进程级别的）
_chdir_lock = threading.Lock()


@contextmanager
def temporary_chdir(path: PathlibPath):
    """临时切换工作目录的上下文管理器（线程安全）。"""
    with _chdir_lock:
        old_cwd = os.getcwd()
        try:
            os.chdir(path)
            yield
        finally:
            os.chdir(old_cwd)


class CapturedInterpreter(InteractiveInterpreter):
    """
    自定义 InteractiveInterpreter，用于捕获 traceback 输出。

    InteractiveInterpreter 的 showtraceback() 和 showsyntaxerror() 方法
    通过调用 write() 方法输出错误信息。我们覆写 write() 来捕获这些输出。
    """

    def __init__(self, locals: Optional[dict[str, Any]] = None) -> None:
        super().__init__(locals=locals)
        self._captured_errors: list[str] = []
        self._last_exception: Optional[tuple[type, BaseException, Any]] = None

    def write(self, data: str) -> None:
        """捕获 showtraceback/showsyntaxerror 的输出。"""
        self._captured_errors.append(data)

    def clear_captured(self) -> None:
        """清除捕获的错误信息。"""
        self._captured_errors.clear()
        self._last_exception = None

    def get_captured_errors(self) -> str:
        """获取捕获的错误信息。"""
        return ''.join(self._captured_errors)

    def showtraceback(self) -> None:
        """覆写以捕获异常信息。"""
        self._last_exception = sys.exc_info()
        super().showtraceback()

    def showsyntaxerror(self, filename: Optional[str] = None) -> None:
        """覆写以捕获语法错误信息。"""
        self._last_exception = sys.exc_info()
        super().showsyntaxerror(filename)

    def get_last_exception(self) -> Optional[tuple[type, BaseException, Any]]:
        """获取最后一次异常信息。"""
        return self._last_exception


@dataclass
class PythonSession:
    """
    Python Session 封装类。

    使用 code.InteractiveInterpreter 实现，支持多实例。
    每个 session 有独立的命名空间和虚拟工作目录。
    """

    session_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    created_at: datetime = field(default_factory=datetime.now)
    workdir: PathlibPath = field(default_factory=lambda: PathlibPath(CONFIG.workdir))

    # 内部状态（不参与 repr）
    _locals: dict[str, Any] = field(default_factory=dict, repr=False)
    _interp: Optional[CapturedInterpreter] = field(default=None, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)
    _execution_count: int = field(default=0, repr=False)
    _closed: bool = field(default=False, repr=False)
    _history: list[HistoryEntry] = field(default_factory=list, repr=False)
    _max_history: int = field(default=100, repr=False)

    def __post_init__(self) -> None:
        """初始化 InteractiveInterpreter。"""
        # 确保 workdir 是绝对路径
        self.workdir = PathlibPath(self.workdir).resolve()

        # 初始化命名空间
        self._locals = {
            '__name__': '__main__',
            '__doc__': None,
            '__session_id__': self.session_id,
        }

        # 创建自定义 interpreter
        self._interp = CapturedInterpreter(locals=self._locals)

        # 注入辅助函数
        self._inject_helpers()

    def _resolve_path(self, path: str) -> PathlibPath:
        """将路径解析为绝对路径（相对于 session 的 workdir）。"""
        p = PathlibPath(path)
        if not p.is_absolute():
            p = self.workdir / p
        return p.resolve()

    def _inject_helpers(self) -> None:
        """注入 cd, pwd, ls, cat 等辅助函数到命名空间。"""
        # 创建对 self 方法的本地引用，供闭包使用
        resolve = self._resolve_path

        def _cd(path: str = '~') -> str:
            """
            切换 session 的虚拟工作目录。

            Args:
                path: 目标路径，支持 ~ 表示用户主目录，默认为 ~

            Returns:
                切换后的绝对路径
            """
            # 处理 ~ 为用户主目录
            if path == '~' or path.startswith('~/') or path.startswith('~\\'):
                path = os.path.expanduser(path)

            new_path = resolve(path)

            if not new_path.is_dir():
                raise FileNotFoundError(f'Directory not found: {new_path}')

            self.workdir = new_path
            return str(new_path)

        def _pwd() -> str:
            """获取当前虚拟工作目录。"""
            return str(self.workdir)

        def _ls(
            path: str = '.',
            all: bool = False,
            long: bool = False,
        ) -> str | list[str]:
            """
            列出目录内容。

            Args:
                path: 目标路径，默认为当前目录
                all: 是否显示隐藏文件（以 . 开头）
                long: 是否显示详细信息（大小、修改时间）

            Returns:
                如果 long=False，返回文件名列表
                如果 long=True，返回格式化的详细信息字符串
            """
            target = resolve(path)

            if not target.exists():
                raise FileNotFoundError(f'Path not found: {target}')

            if target.is_file():
                # 对单个文件
                items = [target]
            else:
                items = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))

            # 过滤隐藏文件
            if not all:
                items = [p for p in items if not p.name.startswith('.')]

            if not long:
                # 简单模式：返回文件名列表，目录名后加 /
                return [f'{p.name}/' if p.is_dir() else p.name for p in items]

            # 详细模式
            lines = []
            for p in items:
                try:
                    stat = p.stat()
                    size = stat.st_size
                    mtime = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M')
                    type_char = 'd' if p.is_dir() else '-'
                    # 格式: drwxr-xr-x  4096 2024-01-15 10:30 dirname/
                    name = f'{p.name}/' if p.is_dir() else p.name
                    lines.append(f'{type_char}  {size:>10}  {mtime}  {name}')
                except (OSError, PermissionError) as e:
                    lines.append(f'?  {"?":>10}  {"?":>16}  {p.name} ({e})')

            return '\n'.join(lines)

        def _cat(path: str, encoding: str = 'utf-8', head: Optional[int] = None, tail: Optional[int] = None) -> str:
            """
            读取文件内容。

            Args:
                path: 文件路径
                encoding: 文件编码，默认 utf-8
                head: 只读取前 N 行
                tail: 只读取后 N 行

            Returns:
                文件内容字符串
            """
            target = resolve(path)

            if not target.exists():
                raise FileNotFoundError(f'File not found: {target}')
            if target.is_dir():
                raise IsADirectoryError(f'Is a directory: {target}')

            content = target.read_text(encoding=encoding)

            if head is not None or tail is not None:
                lines = content.splitlines(keepends=True)
                if head is not None:
                    lines = lines[:head]
                elif tail is not None:
                    lines = lines[-tail:]
                content = ''.join(lines)

            return content

        def _mkdir(path: str, parents: bool = True, exist_ok: bool = True) -> str:
            """
            创建目录。

            Args:
                path: 目录路径
                parents: 是否创建父目录，默认 True
                exist_ok: 目录已存在时是否报错，默认 True（不报错）

            Returns:
                创建的目录绝对路径
            """
            target = resolve(path)

            target.mkdir(parents=parents, exist_ok=exist_ok)
            return str(target)

        def _touch(path: str) -> str:
            """
            创建空文件或更新文件时间戳。

            Args:
                path: 文件路径

            Returns:
                文件绝对路径
            """
            target = resolve(path)

            target.parent.mkdir(parents=True, exist_ok=True)
            target.touch()
            return str(target)

        def _rm(path: str, recursive: bool = False) -> str:
            """
            删除文件或目录。

            Args:
                path: 文件或目录路径
                recursive: 是否递归删除目录，默认 False

            Returns:
                已删除的路径
            """
            target = resolve(path)

            if not target.exists():
                raise FileNotFoundError(f'Path not found: {target}')

            if target.is_dir():
                if recursive:
                    shutil.rmtree(target)
                else:
                    target.rmdir()  # 只能删除空目录
            else:
                target.unlink()

            return str(target)

        def _cp(src: str, dst: str) -> str:
            """
            复制文件。

            Args:
                src: 源文件路径
                dst: 目标路径

            Returns:
                目标文件绝对路径
            """
            src_path = resolve(src)
            dst_path = resolve(dst)

            if not src_path.exists():
                raise FileNotFoundError(f'Source not found: {src_path}')

            if src_path.is_dir():
                shutil.copytree(src_path, dst_path)
            else:
                shutil.copy2(src_path, dst_path)

            return str(dst_path)

        def _mv(src: str, dst: str) -> str:
            """
            移动/重命名文件或目录。

            Args:
                src: 源路径
                dst: 目标路径

            Returns:
                目标路径
            """
            src_path = resolve(src)
            dst_path = resolve(dst)

            if not src_path.exists():
                raise FileNotFoundError(f'Source not found: {src_path}')

            shutil.move(str(src_path), str(dst_path))
            return str(dst_path)

        def _write(path: str, content: str, encoding: str = 'utf-8', append: bool = False) -> str:
            """
            写入文件内容。

            Args:
                path: 文件路径
                content: 要写入的内容
                encoding: 文件编码，默认 utf-8
                append: 是否追加模式，默认 False（覆盖）

            Returns:
                写入的文件绝对路径
            """
            target = resolve(path)

            target.parent.mkdir(parents=True, exist_ok=True)

            mode = 'a' if append else 'w'
            with open(target, mode, encoding=encoding) as f:
                f.write(content)

            return str(target)

        def _exists(path: str) -> bool:
            """检查路径是否存在。"""
            return resolve(path).exists()

        def _isfile(path: str) -> bool:
            """检查是否为文件。"""
            return resolve(path).is_file()

        def _isdir(path: str) -> bool:
            """检查是否为目录。"""
            return resolve(path).is_dir()

        def _abspath(path: str) -> str:
            """获取绝对路径。"""
            return str(resolve(path))

        # 注入所有辅助函数
        self._locals['cd'] = _cd
        self._locals['pwd'] = _pwd
        self._locals['ls'] = _ls
        self._locals['cat'] = _cat
        self._locals['mkdir'] = _mkdir
        self._locals['touch'] = _touch
        self._locals['rm'] = _rm
        self._locals['cp'] = _cp
        self._locals['mv'] = _mv
        self._locals['write'] = _write
        self._locals['exists'] = _exists
        self._locals['isfile'] = _isfile
        self._locals['isdir'] = _isdir
        self._locals['abspath'] = _abspath

        # 保留向后兼容的内部引用
        self._locals['_session_workdir'] = self.workdir
        self._locals['_session_cd'] = _cd
        self._locals['_session_pwd'] = _pwd

    # -------------------------------------------------------------------------
    # 属性
    # -------------------------------------------------------------------------

    @property
    def is_closed(self) -> bool:
        return self._closed

    @property
    def execution_count(self) -> int:
        return self._execution_count

    # -------------------------------------------------------------------------
    # 公共方法
    # -------------------------------------------------------------------------

    def get_info(self) -> dict[str, Any]:
        """获取 session 信息。"""
        return {
            'session_id': self.session_id,
            'created_at': self.created_at.isoformat(),
            'execution_count': self._execution_count,
            'is_closed': self._closed,
            'uptime_seconds': (datetime.now() - self.created_at).total_seconds(),
            'workdir': str(self.workdir),
        }

    async def execute(self, code: str, timeout: Optional[int] = None) -> ExecutionResult:
        """
        执行代码。

        Args:
            code: 要执行的 Python 代码
            timeout: 超时秒数，None 使用默认值，0 不限制

        Returns:
            ExecutionResult 对象
        """
        if self._closed:
            raise RuntimeError('Session is closed')

        effective_timeout = timeout if timeout is not None else CONFIG.exec_timeout

        async with self._lock:
            self._execution_count += 1
            current_count = self._execution_count

            # 更新 workdir 引用（cd 可能改变了它）
            self._locals['_session_workdir'] = self.workdir

            try:
                loop = asyncio.get_event_loop()

                if effective_timeout > 0:
                    result = await asyncio.wait_for(
                        loop.run_in_executor(None, lambda: self._run_code(code)),
                        timeout=effective_timeout,
                    )
                else:
                    result = await loop.run_in_executor(
                        None, lambda: self._run_code(code)
                    )

                result.execution_count = current_count

                # 记录历史
                self._add_history(
                    HistoryEntry(
                        execution_count=current_count,
                        code=code,
                        stdout=result.stdout,
                        stderr=result.stderr,
                        result_repr=result.result_repr,
                        error=result.error,
                        ok=result.ok,
                    )
                )

                return result

            except asyncio.TimeoutError:
                # 超时也记录历史
                timeout_entry = HistoryEntry(
                    execution_count=current_count,
                    code=code,
                    stdout='',
                    stderr=f'Execution timed out after {effective_timeout} seconds',
                    error={
                        'ename': 'TimeoutError',
                        'evalue': f'Code execution exceeded {effective_timeout} seconds',
                        'traceback': [
                            f'TimeoutError: Code execution exceeded {effective_timeout} seconds\n'
                        ],
                    },
                    ok=False,
                )
                self._add_history(timeout_entry)

                return ExecutionResult(
                    ok=False,
                    stdout='',
                    stderr=f'Execution timed out after {effective_timeout} seconds',
                    error={
                        'ename': 'TimeoutError',
                        'evalue': f'Code execution exceeded {effective_timeout} seconds',
                        'traceback': [
                            f'TimeoutError: Code execution exceeded {effective_timeout} seconds\n'
                        ],
                    },
                    timed_out=True,
                    execution_count=current_count,
                )

    def list_variables(self) -> list[VarInfo]:
        """列出所有用户变量。"""
        if self._closed:
            raise RuntimeError('Session is closed')

        variables: list[VarInfo] = []
        for name, value in self._locals.items():
            if name in _HIDDEN_VARS:
                continue
            if name.startswith('_'):
                continue

            variables.append(
                VarInfo(
                    name=name,
                    type_name=type(value).__name__,
                    repr_str=self._safe_repr(value),
                )
            )

        return variables

    def get_variables(self, names: list[str]) -> dict[str, Optional[VarInfo]]:
        """获取指定变量。"""
        if self._closed:
            raise RuntimeError('Session is closed')

        result: dict[str, Optional[VarInfo]] = {}

        for name in names:
            if name not in self._locals:
                result[name] = None
            else:
                value = self._locals[name]
                result[name] = VarInfo(
                    name=name,
                    type_name=type(value).__name__,
                    repr_str=self._safe_repr(value),
                )

        return result

    def reset(self) -> None:
        """重置 session（清除变量和历史）。"""
        if self._closed:
            raise RuntimeError('Session is closed')

        # 保留基础项，清除用户变量
        self._locals.clear()
        self._locals.update({
            '__name__': '__main__',
            '__doc__': None,
            '__session_id__': self.session_id,
        })

        # 重新注入辅助函数
        self._inject_helpers()

        # 重置计数和历史
        self._execution_count = 0
        self._history.clear()

    def get_history(self, n: int = 10) -> list[HistoryEntry]:
        """
        获取最近 n 条执行历史。

        Args:
            n: 返回的历史条数，默认 10，传 0 或负数返回全部

        Returns:
            历史记录列表（从旧到新）
        """
        if self._closed:
            raise RuntimeError('Session is closed')

        if n <= 0:
            return list(self._history)
        return list(self._history[-n:])

    def close(self) -> None:
        """关闭 session。"""
        if self._closed:
            return

        self._closed = True
        self._locals.clear()
        self._interp = None

    # -------------------------------------------------------------------------
    # 私有方法
    # -------------------------------------------------------------------------

    def _add_history(self, entry: HistoryEntry) -> None:
        """添加历史记录，超过最大条数时移除最旧的。"""
        self._history.append(entry)
        if len(self._history) > self._max_history:
            self._history.pop(0)

    def _run_code(self, code: str) -> ExecutionResult:
        """
        同步执行代码（在线程池中调用）。

        使用 InteractiveInterpreter.runsource() 正确执行代码，
        并通过 CapturedInterpreter 捕获 traceback 输出。
        """
        result_repr: Optional[str] = None
        error_dict: Optional[dict[str, Any]] = None

        stdout_capture = io.StringIO()

        # 清除之前的捕获
        self._interp.clear_captured()

        # 临时切换到 session 的工作目录
        with temporary_chdir(self.workdir):
            with redirect_stdout(stdout_capture):
                try:
                    # 策略：
                    # 1. 尝试作为单个表达式执行（使用 'eval' 模式获取返回值）
                    # 2. 如果失败，使用智能的多行处理

                    result_repr = self._execute_smart(code)

                except Exception as e:
                    # 这个 except 捕获的是我们自己代码的异常，不是用户代码的
                    # 用户代码的异常由 InteractiveInterpreter 处理并通过 write() 捕获
                    tb_lines = traceback.format_exception(type(e), e, e.__traceback__)
                    error_dict = {
                        'ename': type(e).__name__,
                        'evalue': str(e),
                        'traceback': tb_lines,
                    }

        # 检查是否有被 InteractiveInterpreter 捕获的错误
        captured_errors = self._interp.get_captured_errors()
        last_exc = self._interp.get_last_exception()

        if last_exc and last_exc[1] is not None:
            exc_type, exc_value, exc_tb = last_exc
            error_dict = {
                'ename': exc_type.__name__ if exc_type else 'Exception',
                'evalue': str(exc_value),
                'traceback': captured_errors.splitlines(keepends=True) if captured_errors else [],
            }

        return ExecutionResult(
            ok=error_dict is None,
            stdout=stdout_capture.getvalue(),
            stderr=captured_errors,  # InteractiveInterpreter 的错误输出
            result_repr=result_repr,
            error=error_dict,
        )

    def _execute_smart(self, code: str) -> Optional[str]:
        """
        智能执行代码。

        策略：
        1. 先尝试作为单个表达式（eval）执行，获取返回值
        2. 如果是多行/语句，解析 AST 判断最后一个是否为表达式
        3. 使用 InteractiveInterpreter.runsource() 执行

        Returns:
            最后一个表达式的 repr，如果没有则返回 None
        """
        code = code.strip()
        if not code:
            return None

        # 尝试作为单个表达式解析
        try:
            # 先尝试 eval 模式编译，看是否为单个表达式
            ast.parse(code, mode='eval')

            # 是单个表达式，使用 runsource 执行并获取结果
            # 但 runsource 使用 'single' 模式会打印结果，我们需要自己处理返回值
            code_obj = compile(code, '<input>', 'eval')
            result = eval(code_obj, self._interp.locals)
            if result is not None:
                return self._safe_repr(result)
            return None

        except SyntaxError:
            # 不是单个表达式，继续处理多行代码
            pass

        # 解析为多行代码
        try:
            tree = ast.parse(code, mode='exec')
        except SyntaxError:
            # 语法错误，让 runsource 处理并显示错误
            self._interp.runsource(code, '<input>', 'exec')
            return None

        if not tree.body:
            return None

        # 检查最后一个语句是否是表达式
        last_stmt = tree.body[-1]

        if isinstance(last_stmt, ast.Expr):
            # 最后一个是表达式语句

            # 先执行前面的语句
            if len(tree.body) > 1:
                pre_stmts = ast.Module(body=tree.body[:-1], type_ignores=[])
                pre_code = compile(pre_stmts, '<input>', 'exec')
                self._interp.runcode(pre_code)

                # 检查是否有错误
                if self._interp.get_last_exception() and self._interp.get_last_exception()[1]:
                    return None

            # 单独 eval 最后一个表达式以获取返回值
            last_expr = ast.Expression(body=last_stmt.value)
            try:
                result = eval(compile(last_expr, '<input>', 'eval'), self._interp.locals)
                if result is not None:
                    return self._safe_repr(result)
            except Exception:
                # 最后一个表达式执行出错，使用 runsource 显示错误
                # 提取最后一行代码
                lines = code.splitlines()
                # 找到最后一个表达式对应的代码行
                last_line_start = last_stmt.lineno - 1
                last_code = '\n'.join(lines[last_line_start:])
                self._interp.runsource(last_code, '<input>', 'single')

            return None

        else:
            # 最后一个不是表达式，使用 runcode 执行全部
            full_code = compile(tree, '<input>', 'exec')
            self._interp.runcode(full_code)
            return None

    @staticmethod
    def _safe_repr(obj: Any, max_len: int = 2000) -> str:
        """安全地获取对象的 repr。"""
        try:
            s = repr(obj)
        except Exception as e:
            s = f'<unrepresentable: {type(e).__name__}>'

        if len(s) > max_len:
            truncated = len(s) - max_len + 20
            s = s[: max_len - 20] + f'... [truncated {truncated} chars]'

        return s


# =============================================================================
# Session 管理器
# =============================================================================


class SessionManager:
    """
    Session 管理器。

    支持多个并发 session（不再受 IPython 单例限制）。
    """

    def __init__(self) -> None:
        self._sessions: dict[str, PythonSession] = {}
        self._lock = asyncio.Lock()

    @property
    def session_count(self) -> int:
        return len(self._sessions)

    def list_sessions(self) -> list[dict[str, Any]]:
        """列出所有活跃 session 的信息。"""
        return [s.get_info() for s in self._sessions.values() if not s.is_closed]

    async def create_session(self, workdir: Optional[str] = None) -> PythonSession:
        """创建新 session。"""
        async with self._lock:
            # 确定工作目录
            if workdir:
                work_path = PathlibPath(workdir).resolve()
                if not work_path.is_dir():
                    raise ValueError(f'Invalid workdir: {workdir}')
            else:
                work_path = PathlibPath(CONFIG.workdir)

            session = PythonSession(workdir=work_path)
            self._sessions[session.session_id] = session
            return session

    async def get_session(self, session_id: str) -> Optional[PythonSession]:
        """获取指定 session。"""
        session = self._sessions.get(session_id)
        if session and not session.is_closed:
            return session
        return None

    async def close_session(self, session_id: str) -> bool:
        """关闭指定 session。"""
        async with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.close()
                del self._sessions[session_id]
                return True
            return False

    async def cleanup_closed_sessions(self) -> int:
        """清理已关闭的 session，返回清理数量。"""
        async with self._lock:
            closed_ids = [
                sid for sid, s in self._sessions.items() if s.is_closed
            ]
            for sid in closed_ids:
                del self._sessions[sid]
            return len(closed_ids)


# 全局 session 管理器
session_manager = SessionManager()


# =============================================================================
# FastAPI 应用
# =============================================================================

app = FastAPI(
    title='Python Session Service',
    version='2.0.0',
    description='远程 Python 代码执行服务（基于 InteractiveInterpreter，支持多 session）',
)


# -----------------------------------------------------------------------------
# 依赖项
# -----------------------------------------------------------------------------


async def verify_token(request: Request) -> None:
    """验证请求的 token 和来源。"""
    # 只允许 localhost
    client_host = request.client.host if request.client else None
    if client_host not in ('127.0.0.1', '::1'):
        raise HTTPException(status_code=403, detail='Forbidden: only localhost allowed')

    # Bearer token 验证
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        raise HTTPException(
            status_code=401, detail='Missing or invalid Authorization header'
        )

    token = auth_header[7:]
    if token != CONFIG.token:
        raise HTTPException(status_code=401, detail='Invalid token')


async def get_valid_session(
    session_id: str = Path(..., description='Session ID'),
) -> PythonSession:
    """获取有效的 session，无效则抛出 404。"""
    session = await session_manager.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail=f'Session not found: {session_id}. '
            f'Please create a session first via POST /v1/session/start',
        )
    return session


# -----------------------------------------------------------------------------
# Pydantic 模型
# -----------------------------------------------------------------------------


class SessionStartRequest(BaseModel):
    """Session 启动请求。"""

    workdir: Optional[str] = None  # 可选的工作目录


class SessionStartResponse(BaseModel):
    """Session 启动响应。"""

    session_id: str
    created_at: str
    workdir: str
    message: str


class SessionInfoResponse(BaseModel):
    """Session 信息响应。"""

    session_id: str
    created_at: str
    execution_count: int
    is_closed: bool
    uptime_seconds: float
    workdir: str


class SessionListResponse(BaseModel):
    """Session 列表响应。"""

    sessions: list[SessionInfoResponse]
    total: int


class ExecRequest(BaseModel):
    """代码执行请求。"""

    code: str
    timeout: Optional[int] = None


class ExecErrorDetail(BaseModel):
    """执行错误详情。"""

    ename: str
    evalue: str
    traceback: list[str]


class ExecResponse(BaseModel):
    """代码执行响应。"""

    ok: bool
    stdout: str
    stderr: str
    result_repr: Optional[str] = None
    error: Optional[ExecErrorDetail] = None
    timed_out: bool = False
    execution_count: int = 0


class VarInfoModel(BaseModel):
    """变量信息模型。"""

    name: str
    type: str
    repr: str


class VarsListResponse(BaseModel):
    """变量列表响应。"""

    variables: list[VarInfoModel]


class VarsGetRequest(BaseModel):
    """获取变量请求。"""

    names: list[str]


class VarsGetResponse(BaseModel):
    """获取变量响应。"""

    values: dict[str, Optional[VarInfoModel]]


class HistoryEntryModel(BaseModel):
    """历史记录条目模型。"""

    execution_count: int
    code: str
    stdout: str
    stderr: str
    result_repr: Optional[str] = None
    error: Optional[ExecErrorDetail] = None
    ok: bool = True


class HistoryResponse(BaseModel):
    """历史记录响应。"""

    entries: list[HistoryEntryModel]
    total: int


class MessageResponse(BaseModel):
    """通用消息响应。"""

    status: str
    message: str


# -----------------------------------------------------------------------------
# 路由
# -----------------------------------------------------------------------------


@app.get('/health')
async def health_check() -> dict[str, Any]:
    """健康检查（无需认证）。"""
    return {
        'status': 'healthy',
        'service': 'python-session',
        'version': '2.0.0',
        'active_sessions': session_manager.session_count,
    }


@app.post(
    '/v1/session/start',
    response_model=SessionStartResponse,
    dependencies=[Depends(verify_token)],
    summary='创建新 Session',
)
async def start_session(
    payload: Optional[SessionStartRequest] = None,
) -> SessionStartResponse:
    """
    创建新的 Python session。

    可以指定 workdir 参数设置 session 的工作目录。
    支持多个并发 session。
    """
    workdir = payload.workdir if payload else None

    try:
        session = await session_manager.create_session(workdir=workdir)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return SessionStartResponse(
        session_id=session.session_id,
        created_at=session.created_at.isoformat(),
        workdir=str(session.workdir),
        message='Session created successfully',
    )


@app.get(
    '/v1/sessions',
    response_model=SessionListResponse,
    dependencies=[Depends(verify_token)],
    summary='列出所有 Sessions',
)
async def list_sessions() -> SessionListResponse:
    """列出所有活跃的 session。"""
    sessions = session_manager.list_sessions()
    return SessionListResponse(
        sessions=[SessionInfoResponse(**s) for s in sessions],
        total=len(sessions),
    )


@app.get(
    '/v1/session/{session_id}/info',
    response_model=SessionInfoResponse,
    dependencies=[Depends(verify_token)],
    summary='获取 Session 信息',
)
async def get_session_info(
    session: PythonSession = Depends(get_valid_session),
) -> SessionInfoResponse:
    """获取指定 session 的详细信息。"""
    info = session.get_info()
    return SessionInfoResponse(**info)


@app.post(
    '/v1/session/{session_id}/exec',
    response_model=ExecResponse,
    dependencies=[Depends(verify_token)],
    summary='执行代码',
)
async def exec_code(
    payload: ExecRequest, session: PythonSession = Depends(get_valid_session)
) -> ExecResponse:
    """在指定 session 中执行 Python 代码。"""
    result = await session.execute(payload.code, payload.timeout)

    error_detail = None
    if result.error:
        error_detail = ExecErrorDetail(**result.error)

    return ExecResponse(
        ok=result.ok,
        stdout=result.stdout,
        stderr=result.stderr,
        result_repr=result.result_repr,
        error=error_detail,
        timed_out=result.timed_out,
        execution_count=result.execution_count,
    )


@app.get(
    '/v1/session/{session_id}/vars',
    response_model=VarsListResponse,
    dependencies=[Depends(verify_token)],
    summary='列出变量',
)
async def list_variables(
    session: PythonSession = Depends(get_valid_session),
) -> VarsListResponse:
    """列出 session 中的所有用户变量。"""
    variables = session.list_variables()
    return VarsListResponse(
        variables=[
            VarInfoModel(name=v.name, type=v.type_name, repr=v.repr_str)
            for v in variables
        ]
    )


@app.post(
    '/v1/session/{session_id}/vars/get',
    response_model=VarsGetResponse,
    dependencies=[Depends(verify_token)],
    summary='获取指定变量',
)
async def get_variables(
    payload: VarsGetRequest, session: PythonSession = Depends(get_valid_session)
) -> VarsGetResponse:
    """获取指定名称的变量信息。"""
    variables = session.get_variables(payload.names)
    return VarsGetResponse(
        values={
            name: VarInfoModel(name=v.name, type=v.type_name, repr=v.repr_str)
            if v
            else None
            for name, v in variables.items()
        }
    )


@app.get(
    '/v1/session/{session_id}/history',
    response_model=HistoryResponse,
    dependencies=[Depends(verify_token)],
    summary='获取执行历史',
)
async def get_history(
    n: int = Query(default=10, description='返回的历史条数，0 返回全部'),
    session: PythonSession = Depends(get_valid_session),
) -> HistoryResponse:
    """
    获取最近 n 条执行历史。

    Args:
        n: 返回的历史条数，默认 10，传 0 返回全部
    """
    entries = session.get_history(n)
    return HistoryResponse(
        entries=[
            HistoryEntryModel(
                execution_count=e.execution_count,
                code=e.code,
                stdout=e.stdout,
                stderr=e.stderr,
                result_repr=e.result_repr,
                error=ExecErrorDetail(**e.error) if e.error else None,
                ok=e.ok,
            )
            for e in entries
        ],
        total=len(session._history),
    )


@app.post(
    '/v1/session/{session_id}/reset',
    response_model=MessageResponse,
    dependencies=[Depends(verify_token)],
    summary='重置 Session',
)
async def reset_session(
    session: PythonSession = Depends(get_valid_session),
) -> MessageResponse:
    """重置 session，清除所有变量和执行历史。"""
    session.reset()
    return MessageResponse(status='ok', message='Session reset successfully')


@app.delete(
    '/v1/session/{session_id}',
    response_model=MessageResponse,
    dependencies=[Depends(verify_token)],
    summary='关闭 Session',
)
async def close_session(
    session_id: str = Path(..., description='Session ID'),
) -> MessageResponse:
    """关闭并销毁指定 session。"""
    closed = await session_manager.close_session(session_id)
    if not closed:
        raise HTTPException(status_code=404, detail=f'Session not found: {session_id}')
    return MessageResponse(status='ok', message='Session closed successfully')


# -----------------------------------------------------------------------------
# 全局异常处理
# -----------------------------------------------------------------------------


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """全局异常处理器。"""
    tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
    return JSONResponse(
        status_code=500,
        content={
            'detail': 'Internal server error',
            'error': type(exc).__name__,
            'message': str(exc),
            'traceback': tb,
        },
    )


# =============================================================================
# 入口
# =============================================================================


def main() -> None:
    """启动服务。"""
    import uvicorn

    print(
        f'[INFO] Starting Python Session Service v2.0\n'
        f'       Address: http://127.0.0.1:{CONFIG.port}\n'
        f'       Default Workdir: {CONFIG.workdir}\n'
        f'       Timeout: {CONFIG.exec_timeout}s (0=unlimited)\n'
        f'       Backend: InteractiveInterpreter (multi-session supported)\n'
    )

    uvicorn.run(app, host='127.0.0.1', port=CONFIG.port)


if __name__ == '__main__':
    main()
