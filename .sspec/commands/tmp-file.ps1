# Copyright (c) 2026 by frostime. All Rights Reserved.
# @Author       : frostime
# @Date         : 2026-02-09
# @FilePath     : /tmp-file.ps1
# @Description  : 创建临时 Markdown 文件并在 VS Code 中打开

<#
.SYNOPSIS
创建临时 Markdown 文件并在 VS Code 中打开

.DESCRIPTION
在 tmp/markdown 目录下创建一个以时间戳命名的临时 Markdown 文件，
并在 VS Code 中打开该文件。

.PARAMETER Content
可选的初始内容。如果未提供，将创建空文件。

.EXAMPLE
.\tmp-file.ps1
创建空白的临时 Markdown 文件

.EXAMPLE
.\tmp-file.ps1 "# 标题`n这是内容"
创建包含指定内容的临时 Markdown 文件
#>

param (
    [string]$Content = ""
)

# [Console]::OutputEncoding = [System.Text.Encoding]::GBK

$markdownDir = "tmp/markdown/"
if (-not (Test-Path $markdownDir)) {
    New-Item -ItemType Directory -Path $markdownDir -Force | Out-Null
    Write-Host "创建目录: $markdownDir" -ForegroundColor Green
}

# 生成时间戳文件名
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName = "temp_${timestamp}.md"
$filePath = Join-Path $markdownDir $fileName

# 创建文件并写入内容
try {
    if ($Content) {
        $Content | Out-File -FilePath $filePath -Encoding UTF8
        Write-Host "创建文件: $filePath (包含内容)" -ForegroundColor Green
    } else {
        # 创建空文件
        New-Item -ItemType File -Path $filePath -Force | Out-Null
        Write-Host "创建文件: $filePath (空文件)" -ForegroundColor Green
    }

    # 在 VS Code 中打开文件
    Write-Host "在 VS Code 中打开文件..." -ForegroundColor Cyan
    code $filePath

    # 返回文件路径，方便其他脚本使用
    return $filePath
}
catch {
    Write-Error "创建文件失败: $_"
    exit 1
}
