import { VFSManager, IVFS } from '@/libs/vfs';
import { Tool, ToolExecuteResult, ToolExecuteStatus, ToolPermissionLevel } from "../types";

export function createShutilTools(vfs: VFSManager): Tool[] {
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
                const { fs, path } = vfs.route(args.path);
                const target = fs.resolve(path);
                if (await fs.exists(target)) {
                    return { status: ToolExecuteStatus.SUCCESS, data: `目录 ${args.path} 已存在` };
                }
                // VFS mkdir always recursive
                await fs.mkdir(target);
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
                const { fs: srcFS, path: srcPathRaw } = vfs.route(args.from);
                const { fs: dstFS, path: dstPathRaw } = vfs.route(args.to);

                if (srcFS !== dstFS) {
                    return { status: ToolExecuteStatus.ERROR, error: '跨文件系统复制文件暂不支持' };
                }

                const src = srcFS.resolve(srcPathRaw);
                let dst = dstFS.resolve(dstPathRaw);

                // 如果目标路径已存在且为目录，则在该目录下使用源项同名作为目标
                if (await dstFS.exists(dst)) {
                    const dstStat = await dstFS.stat(dst);
                    if (dstStat.isDirectory) {
                        dst = dstFS.join(dst, srcFS.basename(src));
                    }
                }

                await srcFS.rename(src, dst);

                // if (srcFS === dstFS) {
                //     await srcFS.rename(src, dst);
                // } else {
                //     // 跨 FS 移动：复制 → 删除
                //     // 简单实现：读取全部内容写入（注意：大文件可能内存溢出，但 VFS 接口目前只有 readFile）
                //     // 如果 VFS 支持流式复制更好，但这里先用 readFile
                //     const content = await srcFS.readFile(src);
                //     await dstFS.writeFile(dst, content);
                //     await srcFS.unlink(src);
                // }

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
                const { fs: srcFS, path: srcPathRaw } = vfs.route(args.from);
                const { fs: dstFS, path: dstPathRaw } = vfs.route(args.to);

                if (srcFS !== dstFS) {
                    return { status: ToolExecuteStatus.ERROR, error: '跨文件系统复制文件暂不支持' };
                }

                const src = srcFS.resolve(srcPathRaw);
                let dst = dstFS.resolve(dstPathRaw);

                // 如果目标路径已存在且为目录，则在该目录下使用源项同名作为目标
                if (await dstFS.exists(dst)) {
                    const dstStat = await dstFS.stat(dst);
                    if (dstStat.isDirectory) {
                        dst = dstFS.join(dst, srcFS.basename(src));
                    }
                }

                // 检查源类型
                const srcStat = await srcFS.stat(src);

                if (srcStat.isDirectory) {
                    if (!args.recursive) {
                        throw new Error('源为目录，请设置 recursive 为 true');
                    }
                    // 递归复制目录
                    await copyRecursive(srcFS, src, dstFS, dst);
                } else {
                    // 复制单个文件
                    await srcFS.copyFile(src, dst);
                    // if (srcFS === dstFS) {

                    // } else {
                    //     // const content = await srcFS.readFile(src);
                    //     // await dstFS.writeFile(dst, content);
                    //     return {
                    //         status: ToolExecuteStatus.ERROR,
                    //         error: '跨文件系统复制文件暂不支持'
                    //     }
                    // }
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
async function copyRecursive(
    srcFS: IVFS, srcPath: string,
    dstFS: IVFS, dstPath: string
): Promise<void> {
    // 确保目标目录存在
    await dstFS.mkdir(dstPath);

    // 读取源目录内容
    const items = await srcFS.readdir(srcPath);

    for (const item of items) {
        const childSrc = srcFS.join(srcPath, item);
        const childDst = dstFS.join(dstPath, item);

        const stat = await srcFS.stat(childSrc);

        if (stat.isDirectory) {
            // 递归复制子目录
            await copyRecursive(srcFS, childSrc, dstFS, childDst);
        } else {
            // 复制文件
            if (srcFS === dstFS) {
                await srcFS.copyFile(childSrc, childDst);
            } else {
                const content = await srcFS.readFile(childSrc);
                await dstFS.writeFile(childDst, content);
            }
        }
    }
}


