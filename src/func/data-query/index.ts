/*
 * Copyright (c) 2024 by zxhd863943427, frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-08 15:00:37
 * @FilePath     : /src/func/data-query/index.ts
 * @LastEditTime : 2024-11-29 16:45:53
 * @Description  :
 *      - Fork from project https://github.com/zxhd863943427/siyuan-plugin-data-query
 *      - 基于该项目的 v0.0.7 版本进行修改
 */
// import type FMiscPlugin from "@/index";
import {
    IProtyle,
} from "siyuan";
import { DataView } from "./data-view";


/**************************************** Query 函数 ****************************************/

import { request, sql, listDocsByPath } from "@/api";
import { initLute } from "./lute";
import { wrapBlock, wrapList } from "./proxy";
import { formatDateTime } from "@/utils/time";


/**
 * Filter blocks in sql search scenario to eliminate duplicate blocks
 * @param blocks Block[]
 * @param mode uni 模式;
 *  - 'leaf' 只返回叶子节点
 *  - 'root' 只返回根节点
 * @param ret 返回类型, 'block' 返回 Block[], 'id' 返回 BlockId[]
 * @returns BlockId[]
 */
function UniBlocks(blocks: Block[], mode: 'leaf' | 'root' = 'leaf', ret: "block" | "id" = "block") {
    console.log('UniBlocks', blocks);
    let p2c = new Map();
    let blocksMap = new Map();
    blocks.forEach(block => {
        p2c.set(block.parent_id, block.id);
        blocksMap.set(block.id, block);
    });
    let blockIdsResult: BlockId[] = [];
    const pushResult = (block: Block) => {
        if (!blockIdsResult.includes(block.id)) {
            blockIdsResult.push(block.id);
        }
    };
    if (mode === 'root') {
        for (let block of blocks) {
            // 找到 block 最顶层的 parent 节点
            while (blocksMap.has(block.parent_id)) {
                block = blocksMap.get(block.parent_id);
            }
            pushResult(block);
        }
    }
    else if (mode === 'leaf') {
        for (let block of blocks) {
            //如果 block 不在 parent 集合中，则 block 为叶子节点
            if (!p2c.has(block.id)) {
                pushResult(block);
            }
        }
    }
    let retBlocks = blockIdsResult.map(id => blocksMap.get(id));
    return ret === "block" ? retBlocks : retBlocks.map(block => block.id);
}

async function getBlocksByIds(...ids: BlockId[]) {
    let idList = ids.map((id) => `"${id}"`);
    let sqlCode = `select * from blocks where id in (${idList.join(",")})`;
    let data = await sql(sqlCode);
    return data;
}

const blocks2Maps = (blocks: Block[]): { [key: BlockId]: Block } => {
    return blocks.reduce((map, block) => {
        map[block.id] = block;
        return map;
    }, {} as { [key: BlockId]: Block });
}

/**************************************** Func ****************************************/


export let name = "DataQuery";
export let enabled = false;

const cond = async (cond: string) => {
    return globalThis.Query.sql(`select * from blocks where ${cond}`);
}

const beginOfDay = (date: Date) => {
    date.setHours(0, 0, 0, 0);
    return date;
}

const Query = {
    DataView: (protyle: IProtyle, item: HTMLElement, top: number | null) => {
        initLute();
        return new DataView(protyle, item, top);
    },
    Utils: {
        today: () => formatDateTime('yyyyMMddHHmmss', beginOfDay(new Date())),
        thisWeek: () => {
            let date = beginOfDay(new Date());
            date.setDate(date.getDate() - date.getDay());
            return formatDateTime('yyyyMMddHHmmss', date);
        },
        nextWeek: () => {
            let date = beginOfDay(new Date());
            date.setDate(date.getDate() + 7 - date.getDay());
            return formatDateTime('yyyyMMddHHmmss', date);
        },
        thisMonth: () => {
            let date = beginOfDay(new Date());
            date.setDate(1);
            return formatDateTime('yyyyMMddHHmmss', date);
        },
        nextMonth: () => {
            let date = beginOfDay(new Date());
            date.setMonth(date.getMonth() + 1);
            date.setDate(1);
            return formatDateTime('yyyyMMddHHmmss', date);
        },
        thisYear: () => {
            let date = beginOfDay(new Date());
            date.setMonth(0);
            date.setDate(1);
            return formatDateTime('yyyyMMddHHmmss', date);
        },
        nextYear: () => {
            let date = beginOfDay(new Date());
            date.setMonth(11);
            date.setDate(31);
            return formatDateTime('yyyyMMddHHmmss', date);
        },
        now: (days?: number) => {
            let date = beginOfDay(new Date());
            date.setDate(date.getDate() + (days ?? 0));
            return formatDateTime('yyyyMMddHHmmss', date);
        }
    },


    wrapBlocks: (...blocks: Block[]) => {
        let wrapped = blocks.map(wrapBlock);
        blocks.length == 1 ? wrapped[0] : wrapped;
    },

    //@deprecated 未来优化为更好的版本
    UniBlocks,
    uniblocks: UniBlocks,


    /**
     * 查询相关的 API
     */
    request: request,
    getBlocksByIds: async (...ids: BlockId[]) => {
        let blocks = await getBlocksByIds(...ids);
        return blocks.map(wrapBlock);
    },
    docId: (protyle: IProtyle) => protyle.block.rootID,
    thisDoc: async (protyle: IProtyle) => {
        let docId = protyle.block.id;
        let doc = await sql(`select * from blocks where id = '${docId}'`);
        return wrapBlock(doc[0]);
    },
    sql: async (fmt: string, wrap: boolean = true) => {
        fmt = fmt.trim();
        let data = await sql(fmt);
        // return wrap ? data.map(wrapBlock) : data;
        return wrap ? wrapList(data) : data;
    },
    cond: cond,
    where: cond,
    //查找块的反链
    backlink: async (id: BlockId, limit?: number) => {
        return globalThis.Query.sql(`
        select * from blocks where id in (
            select block_id from refs where def_block_id = '${id}'
        ) order by updated desc ${limit ? `limit ${limit}` : ''};
        `);
    },
    //查找具有指定属性的 block
    attr: async (name: string, val?: string, valMatch: '=' | 'like' = '=', limit?: number) => {
        return globalThis.Query.sql(`
        SELECT B.*
        FROM blocks AS B
        WHERE B.id IN (
            SELECT A.block_id
            FROM attributes AS A
            WHERE A.name like '${name}'
            ${val ? `AND A.value ${valMatch} '${val}'` : ''}
            ${limit ? `limit ${limit}` : ''}
        );
        `);
    },
    childdocs: async (b: BlockId | Block) => {
        let block = null;
        if (typeof b === 'string') {
            const _ = await getBlocksByIds(b);
            block = _[0];
        } else {
            block = b;
        }
        let data = await listDocsByPath(block.box, block.path);
        let files: any[] = data?.files || [];
        let ids: string[] = files.map(f => f.id);
        let docs = await getBlocksByIds(...ids);
        let docsMap = blocks2Maps(docs);
        docs = ids.map(id => docsMap[id]);
        // return docs.map(wrapBlock);
        return wrapList(docs);
    },

    /**
     * 处理容器块、段落块嵌套的情况；将容器块的第一个段落块 ID 重定向到容器块 ID
     * @param inputs 
     * @returns 
     */
    fb2p: async (inputs: BlockId[] | Block[], enable?: { heading?: boolean, doc?: boolean }) => {
        /**
         * 处理输入参数
         */
        let types = typeof inputs[0] === 'string' ? 'id' : 'block';
        let ids = types === 'id' ? inputs as BlockId[] : (inputs as Block[]).map(b => b.id);
        let blocks: Block[] = inputs as Block[];
        enable = { heading: true, doc: true, ...(enable ?? {}) };

        if (types == 'id') {
            //@ts-ignore
            blocks = blocks.map(id => ({ id: id }));
        }

        /**
         * 获取块的上下文关系
         */
        let data: { [key: BlockId]: any } = await request('/api/block/getBlockTreeInfos', {
            ids: ids
        });
        let result: Block[] = [];

        /**
         * 处理标题、文档块这种特殊情况；在执行 fb2p 后需要使用新的 ID 块的 content 替换旧的 ID 块的 content
         */
        let ReplaceContentTask = {
            blocks: {} as Record<BlockId, Block>,
            addTask: (block: Block) => {
                ReplaceContentTask.blocks[block.id] = block;
            },
            run: async () => {
                let blocks = await getBlocksByIds(...Object.keys(ReplaceContentTask.blocks));
                for (let block of blocks) {
                    if (ReplaceContentTask.blocks[block.id]) {
                        // replaceContentTask.blocks[block.id].content = block.content;
                        Object.assign(ReplaceContentTask.blocks[block.id], block);
                    }
                }
            }
        };

        /**
         * 执行 fb2p
         */
        for (let block of blocks) {
            result.push(block);
            let info = data[block.id];
            if (info.type !== 'NodeParagraph') continue;

            /**
             * 特殊处理：文档引用标识
             * 由于「文献引用」插件的文档第一行被强行占用不能改；再考虑到确实存在在文档中进行引用的情况
             * 所以规定：如果段落中含有标签 '文档引用' 或者 'DOCREF'，则认定为文档级引用
             */
            const content = block.content.trim();
            const refPattern = /#(文档引用|DOCREF)#/;
            if (refPattern.test(content)) {
                console.debug('发现文档引用', block.id);
                let resultp = result[result.length - 1];
                resultp.id = block.root_id;
                resultp.type = 'd';
                ReplaceContentTask.addTask(resultp);
                continue;
            }

            // ---------- 以下为常规的 fb2p 处理逻辑 ----------

            if (
                info.previousID === '' &&
                ['NodeBlockquote', 'NodeListItem'].includes(info.parentType) // 容器块的第一个段落块
            ) {
                let resultp = result[result.length - 1];
                resultp.id = info.parentID;
                resultp.type = { 'NodeBlockquote': 'b', 'NodeListItem': 'i' }[info.parentType];
            } else if (enable.heading && info.previousType === "NodeHeading") { // 标题块下方第一个段落
                let resultp = result[result.length - 1];
                resultp.id = info.previousID;
                resultp.type = 'h';
                ReplaceContentTask.addTask(resultp); // 对标题下方的段落块，执行替换 content 的任务
            } else if (
                enable.doc &&
                info.previousID === '' &&
                info.parentType === "NodeDocument"
            ) { // 文档下第一个段落
                let resultp = result[result.length - 1];
                resultp.id = info.parentID;
                resultp.type = 'd';
                ReplaceContentTask.addTask(resultp); // 对文档下面的段落块，执行替换 content 的任务
            }
        }
        await ReplaceContentTask.run();
        return types === 'block' ? wrapList(result) : result.map(b => b.id);
    },

    //@deprecated 以下这些作为兼容性函数姑且保留，推荐使用 BlockWrapper
    b2link: (b: Block) => `[${b.fcontent || b.content}](siyuan://blocks/${b.id})`,
    b2ref: (b: Block) => `((${b.id} '${b.fcontent || b.content}'))`,
    b2id: (...blocks: Block[]) => {
        let ids = blocks.map(b => b.id);
        return ids.length === 1 ? ids[0] : ids;
    }
}

export const load = () => {
    if (enabled) return;

    // lute = setLute({});
    globalThis.newDV = (protyle: IProtyle, item: HTMLElement, top: number | null) => {
        initLute();
        return new DataView(protyle, item, top);
    }
    globalThis.Query = Query;

    enabled = true;
}

export const unload = () => {
    if (!enabled) return;

    delete globalThis.newDV;
    delete globalThis.Query;

    enabled = false;
}
