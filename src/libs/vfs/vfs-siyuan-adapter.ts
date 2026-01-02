/**
 * 思源笔记文件系统适配器
 *
 * 使用思源的文件系统 API (readDir, getFile, putFile, removeFile) 实现 VFS 接口。
 *
 * 功能特性：
 * - 支持思源内文件的统一管理
 * - 支持路径沙箱限制（可选的 basePath）
 * - 支持文本和二进制文件读写
 * - 支持目录操作（创建、读取、删除）
 * - 支持文件操作（读取、写入、追加、复制、重命名、删除）
 *
 * 使用示例：
 * ```typescript
 * import { SiYuanVFS } from '@/libs/vfs';
 *
 * // 创建适配器实例，限制在 data/temp 目录内
 * const vfs = new SiYuanVFS('data/temp');
 *
 * // 写入文件
 * await vfs.writeFile('test.txt', 'Hello SiYuan!');
 *
 * // 读取文件
 * const content = await vfs.readFile('test.txt');
 * ```
 *
 * 注意事项：
 * - 思源 API 不支持原生的 rename 操作，通过复制+删除实现
 * - 目录重命名暂不支持
 * - 文件时间戳信息可能不准确（API 限制）
 */
import { request, putFile, removeFile } from '@frostime/siyuan-plugin-kits/api';


export class SiYuanVFS {

    /** 路径常量 */
    readonly SIYUAN_DIR = {
        DATA: '/data',
        PUBLIC: '/data/public',
        PLUGIN: '/data/plugins',
        PETAL: '/data/storage/petal',
        THIS_STORAGE: `/data/storage/petal/sy-f-misc`,
        THIS_PLUGIN: `/data/plugins/sy-f-misc`,
    } as const;

    constructor() {
    }

    /** 路径规范化 */
    normalizePath(path: string): string {
        return path
            .replace(/\\/g, '/')           // 统一斜杠
            .replace(/\/+/g, '/')          // 合并连续斜杠
            .replace(/\/\.\//g, '/')       // 移除 /./
            .replace(/\/\.$/, '/');        // 移除末尾 /.
    }

    // ========== 路径操作 ==========

    basename(path: string, ext?: string): string {
        const normalized = this.normalizePath(path);
        const parts = normalized.split('/');
        let base = parts[parts.length - 1] || '';
        if (ext && base.endsWith(ext)) {
            base = base.slice(0, -ext.length);
        }
        return base;
    }

    dirname(path: string): string {
        const normalized = this.normalizePath(path);
        const parts = normalized.split('/');
        parts.pop();
        return parts.length > 0 ? parts.join('/') || '/' : '/';
    }

    join(...paths: string[]): string {
        return this.normalizePath(paths.join('/'));
    }

    extname(path: string): string {
        const base = this.basename(path);
        const lastDot = base.lastIndexOf('.');
        if (lastDot <= 0) return '';
        return base.slice(lastDot);
    }

    resolve(...paths: string[]): string {
        const path = this.normalizePath(paths.join('/'));
        return path.startsWith('/') ? path : `/${path}`;
    }

    // ========== 核心文件系统接口 ==========

    /**
     * @note 思源的 getFile API 简直设计的和狗屎一样
     * @param path 思源内路径, 如 `/data/temp/file.txt`
     * @param forceDataType 强制数据类型
     * @returns `{ ok: boolean; data: any; dataType?: 'text' | 'json' | 'blob'; code?: number; }`
     * 如果 ok 为 true，则 data 包含文件内容，dataType 指示内容类型
     * 如果 ok 为 false，则 data 为 null，code 为错误码
     */
    async readFile(path: string, forceDataType?: 'text' | 'json' | 'blob'): Promise<{
        ok: boolean;
        data: any;
        dataType?: 'text' | 'json' | 'blob';
        code?: number;
    }> {
        path = this.resolve(path);
        let response = await fetch('/api/file/getFile', {
            method: 'POST',
            body: JSON.stringify({
                path: path
            })
        });

        if (response.status === 200) {
            // 如果强制指定了数据类型，优先使用
            if (forceDataType === 'json') {
                const data = await response.json();
                return { ok: true, data, dataType: 'json' };
            }

            if (forceDataType === 'text') {
                const data = await response.text();
                return { ok: true, data, dataType: 'text' };
            }

            if (forceDataType === 'blob') {
                const data = await response.blob();
                return { ok: true, data, dataType: 'blob' };
            }

            // 没有强制指定，根据 Content-Type 判断
            const contentType = response.headers.get('Content-Type') || '';

            if (contentType.includes('application/json')) {
                const data = await response.json();
                return { ok: true, data, dataType: 'json' };
            }

            if (contentType.includes('text/')) {
                const data = await response.text();
                return { ok: true, data, dataType: 'text' };
            }

            // 其他情况作为二进制处理
            const data = await response.blob();
            return { ok: true, data, dataType: 'blob' };
        }

        const payload = await response.json();
        return {
            ok: false,
            data: null,
            ...payload
        };
    }


    async writeFile(
        path: string,
        data: string | Blob | File | ArrayBuffer | ArrayBufferView | Record<string, any>,
    ): Promise<{ ok: boolean; error: 'Unsupported Data' | 'Save Error' | null }> {

        path = this.resolve(path);
        const targetFileName = path.split('/').pop() || 'file';

        let file: File;
        const typeTag = Object.prototype.toString.call(data);

        // --- 分支 1: 已有的 File 对象 ---
        if (typeTag === '[object File]') {
            const originalFile = data as File;
            // 如果原文件名和 path 中的文件名不一致，建议创建一个新 File 指向相同内容但使用新名字
            // 或者依靠 FormData 的第三个参数（见下方）
            file = originalFile;
        }
        // --- 分支 2: 二进制数据 (Blob / ArrayBuffer / TypedArray) ---
        // [object Blob], [object ArrayBuffer], [object Uint8Array] 等
        // File 构造函数原生支持 String, Blob, ArrayBuffer, ArrayBufferView
        else if (
            typeTag === '[object Blob]' ||
            typeTag === '[object ArrayBuffer]' ||
            ArrayBuffer.isView(data) // 检查是否为 Uint8Array 等视图
        ) {
            // 这里的 data 强转为 BlobPart 是安全的，File 构造函数能吃下这些类型
            file = new File([data as BlobPart], targetFileName, { type: 'application/octet-stream' });
        }
        // --- 分支 3: 纯字符串 ---
        else if (typeof data === 'string') {
            file = new File([data], targetFileName, { type: 'text/plain' });
        }
        // --- 分支 4: 普通 JSON 对象 (Pojo) ---
        else if (typeof data === 'object' && data !== null) {
            try {
                const jsonStr = JSON.stringify(data);
                file = new File([jsonStr], targetFileName, { type: 'application/json' });
            } catch (error) {
                return { ok: false, error: 'Unsupported Data' };
            }
        }
        // --- 兜底 ---
        else {
            return { ok: false, error: 'Unsupported Data' };
        }

        try {
            let form = new FormData();
            form.append('path', path);
            form.append('isDir', 'false');
            form.append('modTime', Math.floor(Date.now()).toString());

            // 核心修改：FormData append 第三个参数用于强制指定文件名
            // 这样无论 data 是什么来源，后端收到的文件名永远匹配 path 参数
            form.append('file', file, targetFileName);

            let url = '/api/file/putFile';
            const response = await request(url, form, 'response');
            let ok = response.code === 0;

            // 返回类型对齐 Promise 签名
            return { ok, error: ok ? null : 'Save Error' };
        } catch (error) {
            console.error('saveBlob error:', error);
            return { ok: false, error: 'Save Error' };
        }
    }


    async exists(path: string): Promise<boolean> {
        const actualPath = this.resolve(path);
        const ans = await this.readFile(actualPath);
        return ans.ok || (ans.code === 405); // 405 means it is dir
    }

    async readdir(path: string): Promise<{ ok: boolean; items: { name: string; isDir: boolean; updated: number; }[]; msg?: string; }> {
        const actualPath = this.resolve(path);
        const response = await request('/api/file/readDir', {
            path: actualPath
        }, 'response');
        return {
            ok: response.code === 0,
            items: response.data
        }
    }

    async mkdir(path: string): Promise<boolean> {

        const actualPath = this.resolve(path);
        try {
            // 思源的 putFile 可以创建目录
            await putFile(actualPath, true, null);
        } catch (error) {
            return false
        }
        return true
    }

    async unlink(path: string): Promise<boolean> {

        const actualPath = this.resolve(path);
        const result = await removeFile(actualPath);
        return result.code === 0;
    }

    async copyFile(src: string, dest: string): Promise<boolean> {
        src = this.resolve(src);
        dest = this.resolve(dest);

        const result = await this.readFile(src, 'blob');
        // await this.writeFile(dest, content);
        if (!result.ok) {
            return false;
        }
        let res = await this.writeFile(dest, result.data);
        return res.ok;
    }
}

export const siyuanVfs = new SiYuanVFS();

