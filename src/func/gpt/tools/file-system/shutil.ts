import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

// Node.js modules via window.require
const fs = window?.require?.('fs');
const path = window?.require?.('path');

if (!fs || !path) {
    console.warn('[shutil] Node.js fs/path module not found. All file tools are disabled.');
}

/**
 * Mkdir tool – create directory, supports recursive ("-p") option.
 */
export const mkdirTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs.Mkdir',
            description: '创建目录 (可选 recursive 类似于 mkdir -p)',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '要创建的目录路径' },
                    recursive: { type: 'boolean', description: '是否递归创建目录 (-p)' }
                },
                required: ['path']
            }
        },
        permissionLevel: ToolPermissionLevel.MODERATE
    },
    execute: async (args: { path: string; recursive?: boolean }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }
        if (fs.existsSync(path.resolve(args.path))) {
            return { status: ToolExecuteStatus.SUCCESS, data: `目录 ${args.path} 已存在` };
        }
        try {
            const target = path.resolve(args.path);
            fs.mkdirSync(target, { recursive: args.recursive ?? false });
            return {
                status: ToolExecuteStatus.SUCCESS,
                data: `目录创建成功: ${target}`
            };
        } catch (e: any) {
            return { status: ToolExecuteStatus.ERROR, error: e?.message ?? String(e) };
        }
    }
};

/**
 * MoveFile tool – move/rename file or directory.
 */
export const moveFileTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs.MoveFile',
            description: '移动文件或目录到新位置',
            parameters: {
                type: 'object',
                properties: {
                    from: { type: 'string', description: '源路径' },
                    to: { type: 'string', description: '目标路径(file/dir)' }
                },
                required: ['from', 'to']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },
    execute: async (args: { from: string; to: string }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }
        const src = path.resolve(args.from);
        let dst = path.resolve(args.to);
        // 如果目标路径已存在且为目录，则在该目录下使用源项同名作为目标
        if (fs.existsSync(dst) && fs.statSync(dst).isDirectory()) {
            dst = path.join(dst, path.basename(src));
        }
        try {
            fs.renameSync(src, dst);
            return { status: ToolExecuteStatus.SUCCESS, data: `已移动: ${src} -> ${dst}` };
        } catch (err: any) {
            // 跨磁盘移动时 renameSync 可能失败，尝试复制再删除
            if (err.code === 'EXDEV') {
                try {
                    copyRecursiveSync(src, dst);
                    removeRecursiveSync(src);
                    return { status: ToolExecuteStatus.SUCCESS, data: `已跨设备移动: ${src} -> ${dst}` };
                } catch (e: any) {
                    return { status: ToolExecuteStatus.ERROR, error: e?.message ?? String(e) };
                }
            }
            return { status: ToolExecuteStatus.ERROR, error: err?.message ?? String(err) };
        }
    }
};

/**
 * CopyFile tool – copy file or directory, supports recursive.
 */
export const copyFileTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fs.CopyFile',
            description: '复制文件或目录 (可递归)',
            parameters: {
                type: 'object',
                properties: {
                    from: { type: 'string', description: '源路径' },
                    to: { type: 'string', description: '目标路径(file/dir)' },
                    recursive: { type: 'boolean', description: '对于目录是否递归复制' }
                },
                required: ['from', 'to']
            }
        },
        permissionLevel: ToolPermissionLevel.SENSITIVE
    },
    execute: async (args: { from: string; to: string; recursive?: boolean }): Promise<ToolExecuteResult> => {
        if (!fs || !path) {
            return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
        }
        const src = path.resolve(args.from);
        let dst = path.resolve(args.to);
        // 如果目标路径已存在且为目录，则在该目录下使用源项同名作为目标
        if (fs.existsSync(dst) && fs.statSync(dst).isDirectory()) {
            dst = path.join(dst, path.basename(src));
        }
        try {
            if (fs.cpSync) {
                fs.cpSync(src, dst, { recursive: args.recursive ?? false, force: true });
            } else {
                // Node <16.7 fallback
                if (fs.statSync(src).isDirectory()) {
                    if (!(args.recursive ?? false)) {
                        throw new Error('源为目录，请设置 recursive 为 true');
                    }
                    copyRecursiveSync(src, dst);
                } else {
                    fs.copyFileSync(src, dst);
                }
            }
            return { status: ToolExecuteStatus.SUCCESS, data: `已复制: ${src} -> ${dst}` };
        } catch (e: any) {
            return { status: ToolExecuteStatus.ERROR, error: e?.message ?? String(e) };
        }
    }
};

// ---------- helper functions ----------
function copyRecursiveSync(src: string, dest: string) {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
        for (const child of fs.readdirSync(src)) {
            copyRecursiveSync(path.join(src, child), path.join(dest, child));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

function removeRecursiveSync(target: string) {
    if (fs.existsSync(target)) {
        const stats = fs.statSync(target);
        if (stats.isDirectory()) {
            for (const child of fs.readdirSync(target)) {
                removeRecursiveSync(path.join(target, child));
            }
            fs.rmdirSync(target);
        } else {
            fs.unlinkSync(target);
        }
    }
}
