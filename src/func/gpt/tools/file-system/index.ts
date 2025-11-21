// additional file operation tools
import { mkdirTool, moveFileTool, copyFileTool } from "./shutil";
import { markitdownTool } from "./markitdown";
import { readFileTool, createFileTool, fileStateTool, treeListTool,searchFilesTool,  searchInFileTool, searchInDirectoryTool } from "./viewer";
import { editorTools } from "./editor";

// 通过 window.require 引入 Node.js 模块
const fs = window?.require?.('fs');

/**
 * 文件系统工具组
 */
export const fileSystemTools = {
    name: '文件系统工具组',
    tools: fs ? [
        treeListTool,
        readFileTool,
        createFileTool,
        fileStateTool,
        searchFilesTool,
        searchInFileTool,
        searchInDirectoryTool,
        mkdirTool,
        moveFileTool,
        copyFileTool,
        markitdownTool,
    ] : [],
    rulePrompt: ''
};

export const fileEditorTools = {
    name: '文件编辑工具组',
    tools: fs ? [
        ...editorTools.tools
    ] : [],
    rulePrompt: editorTools.rulePrompt
}

if (fs && fileSystemTools.tools.length > 0) {
    const os = window?.require?.('os');
    // 获取操作系统类型
    const platform = os.platform();
    // 返回 'win32', 'darwin' (macOS), 'linux' 等

    // 获取用户家目录
    const homeDir = os.homedir();

    // 如果是 Windows，获取所有可用的驱动器
    const getWindowsDrives = () => {
        if (platform === 'win32') {
            // 获取所有驱动器
            const drives = [];
            for (let i = 65; i <= 90; i++) {
                const drive = String.fromCharCode(i) + ':\\';
                try {
                    if (fs.existsSync(drive)) {
                        drives.push(drive);
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
            return drives;
        }
        return [];
    };

    const drivers = getWindowsDrives();
    let drivesStr = '';
    if (drivers.length > 0) {
        drivesStr = `可用驱动器：${drivers.join(', ')}`;
    }

    fileSystemTools.rulePrompt = `
当前主机运行的系统: ${platform}, 用户家目录: ${homeDir}
${drivesStr}

### 文件系统工具

**浏览和读取**:
- TreeList: 树状列出目录结构，支持深度和 glob 匹配，显示文件大小
- FileState: 获取特定文件元信息
- ReadFile: 读取文本文件内容

**搜索工具**:
- SearchFiles: 在目录中搜索文件名称（支持正则）
- SearchInFile: 在文件中搜索并显示上下文
- SearchInDirectory: 在目录中搜索包含特定内容的文件

**文件操作**:
- CreateFile: 创建文本文件
- Mkdir: 创建目录 (支持 recursive 类似 -p)
- MoveFile: 移动文件或目录
- CopyFile: 复制文件或目录
- MarkitdownRead: 读取 Word (.docx), PDF (.pdf) 等文件，转换为 Markdown 格式（需要安装 markitdown 工具）

**注意**: 搜索和列表工具会自动限制输出长度，完整结果会保存到临时文件。
`.trim();
}
