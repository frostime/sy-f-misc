// import type Module from "node:module";
import { err, ok, Result } from "./simple-fp";
import { siyuanVfs } from "./vfs/vfs-siyuan-adapter";

const PATH_PREFIX = {
    plugin: '/plugins/sy-f-misc/',
    petal: '/storage/petal/sy-f-misc/',
    public: '/public/',
    snippet: '/snippets/'
}

export const importModule = async (name: string, prefix: keyof typeof PATH_PREFIX): Promise<Result<any, string>> => {
    if (!name.endsWith('.js')) {
        return err('只支持js文件');
    }
    if (!Object.keys(PATH_PREFIX).includes(prefix)) {
        return err('不支持的前缀类型');
    }
    const path = siyuanVfs.join(PATH_PREFIX[prefix], name);
    try {
        const module = await import(/* @vite-ignore */ path);
        return ok(module);
    } catch (e) {
        return err(`导入脚本失败: ${(e as Error).message}`);
    }

}
