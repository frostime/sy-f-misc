/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2025-12-25 00:15:44
 * @Description  :
 * @FilePath     : /src/libs/dynamic-loading.ts
 * @LastEditTime : 2026-01-06 12:57:23
 */
// import type Module from "node:module";
import { err, ok, Result } from "./simple-fp";
import { siyuanVfs } from "./vfs/vfs-siyuan-adapter";

const PATH_PREFIX = {
    plugin: '/plugins/sy-f-misc/',
    petal: '/storage/petal/sy-f-misc/',
    public: '/public/',
    snippet: '/snippets/'
}

const cache = new Map<string, any>();

export const importModule = async (name: string, prefix: keyof typeof PATH_PREFIX): Promise<Result<any, string>> => {
    if (!name.endsWith('.js')) {
        return err('只支持js文件');
    }
    if (!Object.keys(PATH_PREFIX).includes(prefix)) {
        return err('不支持的前缀类型');
    }
    const path = siyuanVfs.join(PATH_PREFIX[prefix], name);
    if (cache.has(path)) {
        return ok(cache.get(path));
    }
    try {
        const module = await import(/* @vite-ignore */ path);
        cache.set(path, module);
        return ok(module);
    } catch (e) {
        return err(`导入脚本失败: ${(e as Error).message}`);
    }

}
