# 编写 Powershell 脚本
# 接受参数 : $change-name 必须提供
# 用法: .\new-change-task.ps1 -changeName "my-change-name"

param(
    [Parameter(Mandatory=$true)]
    [string]$changeName
)

# 获取当前脚本所在目录
$thisDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 构建 demo 目录路径
$demoDir = Join-Path $thisDir ".." "template" "changes"
$demoDir = [System.IO.Path]::GetFullPath($demoDir)

# 构建目标目录路径
$targetDir = Join-Path $thisDir ".." "changes" $changeName
$targetDir = [System.IO.Path]::GetFullPath($targetDir)

# 检查 demo 目录是否存在
if (-not (Test-Path $demoDir)) {
    Write-Error "Demo directory not found: $demoDir"
    exit 1
}

# 检查目标目录是否已存在
if (Test-Path $targetDir) {
    Write-Error "Target directory already exists: $targetDir"
    exit 1
}

# 创建目标目录
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

# 复制所有文件从 demo 目录到目标目录
Copy-Item -Path "$demoDir\*" -Destination $targetDir -Recurse

Write-Host "Copied demo template to: $targetDir" -ForegroundColor Green

# 获取当前时间 (ISO 8601 格式)
$currentTime = Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"

# 遍历目标目录中的所有文件
Get-ChildItem -Path $targetDir -File -Recurse | ForEach-Object {
    $file = $_.FullName

    # 读取文件内容
    $content = Get-Content $file -Raw

    # 替换 {{CHANGE_NAME}} 占位符
    $newContent = $content -replace '\{\{CHANGE_NAME\}\}', $changeName

    # 替换 {{TIME}} 占位符
    $newContent = $newContent -replace '\{\{TIME\}\}', $currentTime

    # 如果内容有变化，则写回文件
    if ($content -ne $newContent) {
        Set-Content -Path $file -Value $newContent -NoNewline
        Write-Host "Updated placeholder in: $($_.Name)" -ForegroundColor Yellow
    }
}

Write-Host "`nChange task created successfully!" -ForegroundColor Green
Write-Host "Directory: $targetDir" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Review and update files in the new directory"
Write-Host "2. Update tasks.md with your implementation plan"
Write-Host "3. Update spec.md with your change specification"
