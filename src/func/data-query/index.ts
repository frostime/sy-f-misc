/*
 * Copyright (c) 2024 by zxhd863943427, frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-08 15:00:37
 * @FilePath     : /src/func/data-query/index.ts
 * @LastEditTime : 2024-07-28 20:31:38
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

export const load = () => {
    if (enabled) return;

    // lute = setLute({});
    globalThis.newDV = (protyle: IProtyle, item: HTMLElement, top: number | null) => {
        initLute();
        return new DataView(protyle, item, top);
    }
    globalThis.Query = {
        DataView: (protyle: IProtyle, item: HTMLElement, top: number | null) => {
            initLute();
            return new DataView(protyle, item, top);
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
                WHERE A.name = '${name}'
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
        fb2p: async (inputs: BlockId[] | Block[]) => {
            let types = typeof inputs[0] === 'string' ? 'id' : 'block';
            let ids = types === 'id' ? inputs as BlockId[] : (inputs as Block[]).map(b => b.id);
            let blocks: Block[] = inputs as Block[];
            if (types == 'id') {
                //@ts-ignore
                blocks = blocks.map(id => ({ id: id }));
            }
            let data: { [key: BlockId]: any } = await request('/api/block/getBlockTreeInfos', {
                ids: ids
            });
            let result: Block[] = [];
            for (let block of blocks) {
                result.push(block);
                let info = data[block.id];
                if (info.type !== 'NodeParagraph') continue;
                if (info.previousID !== '') continue;
                if (!['NodeBlockquote', 'NodeListItem'].includes(info.parentType)) continue;
                let resultp = result[result.length - 1];
                resultp.id = info.parentID;
                resultp.type = { 'NodeBlockquote': 'b', 'NodeListItem': 'i' }[info.parentType];
            }
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

    enabled = true;
}

export const unload = () => {
    if (!enabled) return;

    delete globalThis.newDV;
    delete globalThis.Query;

    enabled = false;
}
