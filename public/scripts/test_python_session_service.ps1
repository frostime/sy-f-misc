# Python Session Service 自动化测试脚本
# 用法:
#   .\test_python_session_service.ps1           - 启动服务并运行全部测试
#   .\test_python_session_service.ps1 -NoStart  - 仅运行测试（假设服务已启动）

param(
    [switch]$NoStart = $false
)

# =============================================================================
# 配置
# =============================================================================

$env:PYSESSION_TOKEN = '000000'
$env:PYSESSION_PORT = '12800'
$BaseUrl = "http://127.0.0.1:$env:PYSESSION_PORT"
$Headers = @{
    "Authorization" = "Bearer $env:PYSESSION_TOKEN"
    "Content-Type"  = "application/json"
}
$ServiceScript = "$PSScriptRoot\python_session_service.py"

# 测试统计
$script:TestsPassed = 0
$script:TestsFailed = 0
$script:SessionId = $null

# =============================================================================
# 辅助函数
# =============================================================================

function Write-TestHeader {
    param([string]$Name)
    Write-Host "`n[$Name]" -ForegroundColor Yellow
}

function Write-Pass {
    param([string]$Message)
    $script:TestsPassed++
    Write-Host "  ✓ $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    $script:TestsFailed++
    Write-Host "  ✗ $Message" -ForegroundColor Red
}

function Invoke-API {
    param(
        [string]$Method,
        [string]$Endpoint,
        [object]$Body = $null
    )
    
    $uri = "$BaseUrl$Endpoint"
    $params = @{
        Uri = $uri
        Method = $Method
        Headers = $Headers
    }
    
    if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }
    
    try {
        return Invoke-RestMethod @params
    } catch {
        return @{
            _error = $true
            status_code = $_.Exception.Response.StatusCode.value__
            message = $_.Exception.Message
        }
    }
}

function Exec-Code {
    param([string]$Code, [int]$Timeout = 0)
    
    $body = @{ code = $Code }
    if ($Timeout -gt 0) { $body.timeout = $Timeout }
    
    return Invoke-API -Method Post -Endpoint "/v1/session/$script:SessionId/exec" -Body $body
}

# =============================================================================
# 测试用例
# =============================================================================

function Test-HealthCheck {
    Write-TestHeader "健康检查"
    
    $resp = Invoke-API -Method Get -Endpoint "/health"
    if ($resp._error) {
        Write-Fail "无法连接服务: $($resp.message)"
        return $false
    }
    
    if ($resp.status -eq 'healthy') {
        Write-Pass "服务状态: healthy, 版本: $($resp.version)"
        return $true
    }
    
    Write-Fail "服务状态异常: $($resp.status)"
    return $false
}

function Test-SessionLifecycle {
    Write-TestHeader "Session 生命周期"
    
    # 创建 session
    $resp = Invoke-API -Method Post -Endpoint "/v1/session/start"
    if ($resp._error) {
        Write-Fail "创建 session 失败"
        return $false
    }
    $script:SessionId = $resp.session_id
    Write-Pass "创建 session: $($resp.session_id)"
    
    # 获取 session 信息
    $resp = Invoke-API -Method Get -Endpoint "/v1/session/$script:SessionId/info"
    if (-not $resp._error -and $resp.execution_count -eq 0) {
        Write-Pass "获取 session 信息: execution_count=0"
    } else {
        Write-Fail "获取 session 信息失败"
    }
    
    # 测试无效 session
    $resp = Invoke-API -Method Get -Endpoint "/v1/session/invalid_id/info"
    if ($resp._error -and $resp.status_code -eq 404) {
        Write-Pass "无效 session 返回 404"
    } else {
        Write-Fail "无效 session 应返回 404"
    }
    
    return $true
}

function Test-BasicCodeExecution {
    Write-TestHeader "基础代码执行"
    
    # 简单表达式
    $resp = Exec-Code "1 + 1"
    if ($resp.ok -and $resp.result_repr -eq '2') {
        Write-Pass "表达式求值: 1 + 1 = 2"
    } else {
        Write-Fail "表达式求值失败: $($resp | ConvertTo-Json -Compress)"
    }
    
    # 变量赋值和打印
    $resp = Exec-Code "x = 42`nprint(f'x = {x}')`nx * 2"
    if ($resp.ok -and $resp.stdout.Trim() -eq 'x = 42' -and $resp.result_repr -eq '84') {
        Write-Pass "变量赋值和多行代码: x=42, result=84"
    } else {
        Write-Fail "多行代码执行失败"
    }
    
    # 变量持久化
    $resp = Exec-Code "x"
    if ($resp.ok -and $resp.result_repr -eq '42') {
        Write-Pass "变量持久化: x 仍为 42"
    } else {
        Write-Fail "变量持久化失败"
    }
    
    # 列出变量
    $resp = Invoke-API -Method Get -Endpoint "/v1/session/$script:SessionId/vars"
    if (-not $resp._error -and ($resp.variables | Where-Object { $_.name -eq 'x' })) {
        Write-Pass "列出变量: 包含 x"
    } else {
        Write-Fail "列出变量失败"
    }
}

function Test-ErrorHandling {
    Write-TestHeader "错误处理"
    
    # 除零错误
    $resp = Exec-Code "1/0"
    if (-not $resp.ok -and $resp.error.ename -eq 'ZeroDivisionError') {
        Write-Pass "捕获 ZeroDivisionError"
    } else {
        Write-Fail "未能捕获除零错误"
    }
    
    # 语法错误
    $resp = Exec-Code "if True print('x')"
    if (-not $resp.ok) {
        Write-Pass "捕获语法错误"
    } else {
        Write-Fail "未能捕获语法错误"
    }
    
    # NameError
    $resp = Exec-Code "undefined_variable"
    if (-not $resp.ok -and $resp.error.ename -eq 'NameError') {
        Write-Pass "捕获 NameError"
    } else {
        Write-Fail "未能捕获 NameError"
    }
}

function Test-Timeout {
    Write-TestHeader "超时控制"
    
    $resp = Exec-Code "import time; time.sleep(5)" -Timeout 2
    if ($resp.timed_out -and -not $resp.ok) {
        Write-Pass "2秒超时生效"
    } else {
        Write-Fail "超时控制失败"
    }
}

function Test-HelperFunctions {
    Write-TestHeader "辅助函数 (文件系统)"
    
    # pwd
    $resp = Exec-Code "pwd()"
    if ($resp.ok -and $resp.result_repr) {
        Write-Pass "pwd(): $($resp.result_repr)"
    } else {
        Write-Fail "pwd() 失败"
    }
    
    # ls
    $resp = Exec-Code "ls()"
    if ($resp.ok -and $resp.result_repr -match '\[') {
        Write-Pass "ls(): 返回列表"
    } else {
        Write-Fail "ls() 失败"
    }
    
    # ls(long=True)
    $resp = Exec-Code "ls('.', long=True)"
    if ($resp.ok -and $resp.result_repr -match '\d{4}-\d{2}-\d{2}') {
        Write-Pass "ls(long=True): 包含日期格式"
    } else {
        Write-Fail "ls(long=True) 失败"
    }
    
    # exists/isfile/isdir
    $resp = Exec-Code "[exists('.'), isdir('.'), isfile('.')]"
    if ($resp.ok -and $resp.result_repr -eq '[True, True, False]') {
        Write-Pass "exists/isdir/isfile 检查正确"
    } else {
        Write-Fail "exists/isdir/isfile 失败: $($resp.result_repr)"
    }
    
    # 创建临时文件测试
    $resp = Exec-Code @"
import tempfile
import os
test_dir = tempfile.mkdtemp()
cd(test_dir)
pwd()
"@
    if ($resp.ok) {
        Write-Pass "cd 到临时目录"
        
        # touch
        $resp = Exec-Code "touch('test.txt')"
        if ($resp.ok -and $resp.result_repr -match 'test\.txt') {
            Write-Pass "touch 创建文件"
        } else {
            Write-Fail "touch 失败"
        }
        
        # write
        $resp = Exec-Code "write('test.txt', 'Hello World!')"
        if ($resp.ok) {
            Write-Pass "write 写入文件"
        } else {
            Write-Fail "write 失败"
        }
        
        # cat
        $resp = Exec-Code "cat('test.txt')"
        if ($resp.ok -and $resp.result_repr -match 'Hello World') {
            Write-Pass "cat 读取文件"
        } else {
            Write-Fail "cat 失败"
        }
        
        # mkdir
        $resp = Exec-Code "mkdir('subdir')"
        if ($resp.ok -and (Exec-Code "isdir('subdir')").result_repr -eq 'True') {
            Write-Pass "mkdir 创建目录"
        } else {
            Write-Fail "mkdir 失败"
        }
        
        # cp
        $resp = Exec-Code "cp('test.txt', 'test_copy.txt')"
        if ($resp.ok -and (Exec-Code "exists('test_copy.txt')").result_repr -eq 'True') {
            Write-Pass "cp 复制文件"
        } else {
            Write-Fail "cp 失败"
        }
        
        # mv
        $resp = Exec-Code "mv('test_copy.txt', 'test_moved.txt')"
        if ($resp.ok -and (Exec-Code "exists('test_moved.txt')").result_repr -eq 'True') {
            Write-Pass "mv 移动文件"
        } else {
            Write-Fail "mv 失败"
        }
        
        # rm
        $resp = Exec-Code "rm('test_moved.txt')"
        if ($resp.ok -and (Exec-Code "exists('test_moved.txt')").result_repr -eq 'False') {
            Write-Pass "rm 删除文件"
        } else {
            Write-Fail "rm 失败"
        }
        
        # rm recursive
        $resp = Exec-Code "rm('subdir', recursive=True)"
        if ($resp.ok -and (Exec-Code "exists('subdir')").result_repr -eq 'False') {
            Write-Pass "rm(recursive=True) 删除目录"
        } else {
            Write-Fail "rm(recursive=True) 失败"
        }
        
        # 清理
        Exec-Code "import shutil; cd('..'); shutil.rmtree(test_dir)" | Out-Null
    } else {
        Write-Fail "无法创建临时测试目录"
    }
    
    # abspath
    $resp = Exec-Code "abspath('.')"
    if ($resp.ok -and $resp.result_repr) {
        Write-Pass "abspath: $($resp.result_repr)"
    } else {
        Write-Fail "abspath 失败"
    }
}

function Test-SessionReset {
    Write-TestHeader "Session 重置"
    
    # 确保有变量
    Exec-Code "reset_test_var = 123" | Out-Null
    
    # 重置
    $resp = Invoke-API -Method Post -Endpoint "/v1/session/$script:SessionId/reset"
    if (-not $resp._error -and $resp.status -eq 'ok') {
        Write-Pass "Session 重置成功"
    } else {
        Write-Fail "Session 重置失败"
    }
    
    # 验证变量已清除
    $resp = Invoke-API -Method Get -Endpoint "/v1/session/$script:SessionId/vars"
    if (-not $resp._error -and $resp.variables.Count -eq 0) {
        Write-Pass "变量已清除"
    } else {
        Write-Fail "变量未正确清除"
    }
    
    # 验证辅助函数仍可用
    $resp = Exec-Code "pwd()"
    if ($resp.ok) {
        Write-Pass "辅助函数仍可用"
    } else {
        Write-Fail "辅助函数不可用"
    }
}

function Test-MultiSession {
    Write-TestHeader "多 Session 支持"
    
    # 创建第二个 session
    $resp = Invoke-API -Method Post -Endpoint "/v1/session/start"
    if ($resp._error) {
        Write-Fail "创建第二个 session 失败"
        return
    }
    $session2 = $resp.session_id
    Write-Pass "创建第二个 session: $session2"
    
    # 在两个 session 中设置不同变量
    Exec-Code "session1_var = 'A'" | Out-Null
    
    $body = @{ code = "session2_var = 'B'" }
    Invoke-API -Method Post -Endpoint "/v1/session/$session2/exec" -Body $body | Out-Null
    
    # 验证隔离
    $resp = Exec-Code "session1_var"
    if ($resp.ok -and $resp.result_repr -eq "'A'") {
        Write-Pass "Session 1 变量正确"
    } else {
        Write-Fail "Session 1 变量错误"
    }
    
    $body = @{ code = "session2_var" }
    $resp = Invoke-API -Method Post -Endpoint "/v1/session/$session2/exec" -Body $body
    if ($resp.ok -and $resp.result_repr -eq "'B'") {
        Write-Pass "Session 2 变量正确"
    } else {
        Write-Fail "Session 2 变量错误"
    }
    
    # 验证 session 间隔离
    $resp = Exec-Code "session2_var"
    if (-not $resp.ok -and $resp.error.ename -eq 'NameError') {
        Write-Pass "Session 变量隔离正确"
    } else {
        Write-Fail "Session 变量隔离失败"
    }
    
    # 列出所有 sessions
    $resp = Invoke-API -Method Get -Endpoint "/v1/sessions"
    if (-not $resp._error -and $resp.total -ge 2) {
        Write-Pass "列出 sessions: total=$($resp.total)"
    } else {
        Write-Fail "列出 sessions 失败"
    }
    
    # 关闭第二个 session
    $resp = Invoke-API -Method Delete -Endpoint "/v1/session/$session2"
    if (-not $resp._error) {
        Write-Pass "关闭第二个 session"
    } else {
        Write-Fail "关闭 session 失败"
    }
}

function Test-Cleanup {
    Write-TestHeader "清理"
    
    if ($script:SessionId) {
        $resp = Invoke-API -Method Delete -Endpoint "/v1/session/$script:SessionId"
        if (-not $resp._error) {
            Write-Pass "关闭测试 session"
        } else {
            Write-Fail "关闭 session 失败"
        }
    }
}

# =============================================================================
# 主逻辑
# =============================================================================

Write-Host "`n" -NoNewline
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Python Session Service 自动化测试 v2.0              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

$process = $null

try {
    # 启动服务（如果需要）
    if (-not $NoStart) {
        Write-Host "`n启动服务..." -ForegroundColor Gray
        
        if (-not (Test-Path $ServiceScript)) {
            Write-Host "错误: 找不到服务脚本: $ServiceScript" -ForegroundColor Red
            exit 1
        }
        
        $process = Start-Process -FilePath "python" -ArgumentList $ServiceScript -PassThru -NoNewWindow
        Start-Sleep -Seconds 2
        
        if ($process.HasExited) {
            Write-Host "错误: 服务启动失败" -ForegroundColor Red
            exit 1
        }
        
        Write-Host "服务已启动 (PID: $($process.Id))" -ForegroundColor Green
    }
    
    # 运行测试
    if (-not (Test-HealthCheck)) {
        Write-Host "`n无法连接到服务，测试终止" -ForegroundColor Red
        exit 1
    }
    
    Test-SessionLifecycle
    Test-BasicCodeExecution
    Test-ErrorHandling
    Test-Timeout
    Test-HelperFunctions
    Test-SessionReset
    Test-MultiSession
    Test-Cleanup
    
    # 输出结果
    Write-Host "`n" -NoNewline
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  测试完成: " -NoNewline -ForegroundColor White
    Write-Host "$script:TestsPassed 通过" -NoNewline -ForegroundColor Green
    Write-Host ", " -NoNewline
    if ($script:TestsFailed -eq 0) {
        Write-Host "$script:TestsFailed 失败" -ForegroundColor Green
    } else {
        Write-Host "$script:TestsFailed 失败" -ForegroundColor Red
    }
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    
} finally {
    # 清理
    if ($process -and -not $process.HasExited) {
        Write-Host "`n停止服务..." -ForegroundColor Gray
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        Write-Host "服务已停止" -ForegroundColor Gray
    }
}

# 返回退出码
if ($script:TestsFailed -gt 0) {
    exit 1
}
exit 0
