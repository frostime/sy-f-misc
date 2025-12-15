import { IVFS } from '../../../../libs/vfs';
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

export function createShutilTools(vfs: IVFS): Tool[] {
    /**
     * Mkdir tool – create directory, supports recursive ("-p") option.
     */
    const mkdirTool: Tool = {
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
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
            }
            try {
                const target = vfs.resolve(args.path);
                if (await vfs.exists(target)) {
                    return { status: ToolExecuteStatus.SUCCESS, data: `目录 ${args.path} 已存在` };
                }
                // VFS mkdir always recursive
                await vfs.mkdir(target);
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
    const moveFileTool: Tool = {
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
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
            }
            try {
                const src = vfs.resolve(args.from);
                let dst = vfs.resolve(args.to);

                // 如果目标路径已存在且为目录，则在该目录下使用源项同名作为目标
                if (await vfs.exists(dst)) {
                    const dstStat = await vfs.stat(dst);
                    if (dstStat.isDirectory) {
                        dst = vfs.join(dst, vfs.basename(src));
                    }
                }

                await vfs.rename(src, dst);
                return { status: ToolExecuteStatus.SUCCESS, data: `已移动: ${src} -> ${dst}` };
            } catch (err: any) {
                return { status: ToolExecuteStatus.ERROR, error: err?.message ?? String(err) };
            }
        }
    };

    /**
     * CopyFile tool – copy file or directory, supports recursive.
     */
    const copyFileTool: Tool = {
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
            if (!vfs.isAvailable()) {
                return { status: ToolExecuteStatus.ERROR, error: '当前环境不支持文件系统操作' };
            }
            try {
                const src = vfs.resolve(args.from);
                let dst = vfs.resolve(args.to);

                // 如果目标路径已存在且为目录，则在该目录下使用源项同名作为目标
                if (await vfs.exists(dst)) {
                    const dstStat = await vfs.stat(dst);
                    if (dstStat.isDirectory) {
                        dst = vfs.join(dst, vfs.basename(src));
                    }
                }

                // 检查源类型
                const srcStat = await vfs.stat(src);

                if (srcStat.isDirectory) {
                    if (!args.recursive) {
                        throw new Error('源为目录，请设置 recursive 为 true');
                    }
                    // 递归复制目录
                    await copyRecursive(vfs, src, dst);
                } else {
                    // 复制单个文件
                    await vfs.copyFile(src, dst);
                }

                return { status: ToolExecuteStatus.SUCCESS, data: `已复制: ${src} -> ${dst}` };
            } catch (e: any) {
                return { status: ToolExecuteStatus.ERROR, error: e?.message ?? String(e) };
            }
        }
    };

    return [mkdirTool, moveFileTool, copyFileTool];
}

/**
 * 递归复制目录
 */
async function copyRecursive(vfs: IVFS, src: string, dst: string): Promise<void> {
    // 确保目标目录存在
    await vfs.mkdir(dst);

    // 读取源目录内容
    const items = await vfs.readdir(src);

    for (const item of items) {
        const srcPath = vfs.join(src, item);
        const dstPath = vfs.join(dst, item);

        const stat = await vfs.stat(srcPath);

        if (stat.isDirectory) {
            // 递归复制子目录
            await copyRecursive(vfs, srcPath, dstPath);
        } else {
            // 复制文件
            await vfs.copyFile(srcPath, dstPath);
        }
    }
}

/**
 * 递归删除目录
 */
async function removeRecursive(vfs: IVFS, target: string): Promise<void> {
    const stat = await vfs.stat(target);

    if (stat.isDirectory) {
        const items = await vfs.readdir(target);
        for (const item of items) {
            await removeRecursive(vfs, vfs.join(target, item));
        }
        await vfs.rmdir(target);
    } else {
        await vfs.unlink(target);
    }
}
