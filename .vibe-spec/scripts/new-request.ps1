# 编写 Powershell 脚本
# 接受参数 : $requestName 必须提供
# 用法: .\new-request.ps1 -requestName "my-request-name"

param(
    [Parameter(Mandatory=$true)]
    [string]$requestName
)

# 获取当前脚本所在目录
$thisDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 构建 template 文件路径
$templateFile = Join-Path $thisDir ".." "template" "requests.md"
$templateFile = [System.IO.Path]::GetFullPath($templateFile)

# 构建目标目录路径
$targetDir = Join-Path $thisDir ".." "requests"
$targetDir = [System.IO.Path]::GetFullPath($targetDir)

# 构建目标文件路径
$targetFile = Join-Path $targetDir "$requestName.md"

# 检查 template 文件是否存在
if (-not (Test-Path $templateFile)) {
    Write-Error "Template file not found: $templateFile"
    exit 1
}

# 检查目标目录是否存在，不存在则创建
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

# 检查目标文件是否已存在
if (Test-Path $targetFile) {
    Write-Error "Target file already exists: $targetFile"
    exit 1
}

# 读取模板文件内容
$content = Get-Content $templateFile -Raw

# 获取当前时间 (ISO 8601 格式)
$currentTime = Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"

# 替换 {{TIME}} 占位符
$newContent = $content -replace '\{\{TIME\}\}', $currentTime

# 写入目标文件
Set-Content -Path $targetFile -Value $newContent -NoNewline

Write-Host "Request file created successfully!" -ForegroundColor Green
Write-Host "File: $targetFile" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Open and edit the request file"
Write-Host "2. Update the status field as needed"
Write-Host "3. Add attach-change reference if applicable"
Write-Host "4. Fill in the tldr (brief summary)"
