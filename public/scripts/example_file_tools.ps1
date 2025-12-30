<#
.SYNOPSIS
文件操作工具集
#>

function Get-FileStats {
    <#
    .SYNOPSIS
    获取文件统计信息

    .PARAMETER Path
    文件路径

    .OUTPUTS
    hashtable 包含 path, size, lastModified 字段
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path
    )

    $file = Get-Item $Path
    return @{
        path = $file.FullName
        size = $file.Length
        lastModified = $file.LastWriteTime
    }
}

# 格式化函数（应该被跳过）
function Format-Get-FileStats {
    param(
        [hashtable]$Result,
        [hashtable]$Arguments
    )

    $sizeMB = [math]::Round($Result.size / 1MB, 2)
    return "文件 $($Result.path) 大小 $sizeMB MB"
}
