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
## 文件系统工具组 ##

**环境**: ${platform}, 家目录: \`${homeDir}\`${drivesStr ? `, ${drivesStr}` : ''}

**浏览**: TreeList(目录树) | FileState(文件元信息) | ReadFile(读取内容)
**搜索**: SearchFiles(文件名) | SearchInFile(文件内搜索) | SearchInDirectory(目录内搜索)
**操作**: CreateFile | Mkdir(-p) | MoveFile | CopyFile
**转换**: MarkitdownRead(docx/pdf→Markdown，需 markitdown)
`.trim();
}
