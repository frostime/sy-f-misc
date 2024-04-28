/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-24 16:20:34
 * @FilePath     : /src/func/global-this.ts
 * @LastEditTime : 2024-04-28 20:18:09
 * @Description  : 将各种函数暴露到 global-this 对象中
 */
// import type FMiscPlugin from "@/index";

/**
 * Filter blocks in sql search scenario to eliminate duplicate blocks
 * @param blocks Block[]
 * @param mode uni 模式;
 *  - 'leaf' 只返回叶子节点
 *  - 'root' 只返回根节点
 * @param para_in_li boolean, 如果为 True 则对在 li 中的 p 节点进行处理
 * @param ret 返回类型, 'block' 返回 Block[], 'id' 返回 BlockId[]
 * @returns BlockId[]
 */

import { sql } from "@/api";


function UniBlocks(blocks: Block[], mode: 'leaf' | 'root' = 'leaf', para_in_li: boolean = true, ret: "block" | "id" ="block") {
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
                //如果是 li 内的 p 节点, 则
                if (para_in_li && block.type === 'p') {
                    let parent = blocksMap.get(block.parent_id);
                    if (parent && parent.type === 'i') {
                        block = parent;
                    }
                }
                pushResult(block);
            }
        }
    }
    let retBlocks = blockIdsResult.map(id => blocksMap.get(id));
    return ret === "block" ? retBlocks : retBlocks.map(block => block.id);
}

async function GetBlocksByIDs(...ids: BlockId[]) {
    let idList = ids.map((id) => `"${id}"`);
    let sqlCode = `select * from blocks where id in (${idList.join(",")})`;
    let data = await sql(sqlCode);
    if (!data) {
        return data;
    }
    let dataMap = {};
    for (let block of data) {
        dataMap[block.id] = block;
    }
    return dataMap;
}

export let name = 'GlobalThis';
export let enabled = false;

export const load = () => {
    if (enabled) return;
    const fMisc = {
        UniBlocks,
        GetBlocksByIDs,
    }
    globalThis.fMisc = fMisc;
    globalThis['f-misc'] = fMisc;
    enabled = true;
}

export const unload = () => {
    if (!enabled) return;
    delete globalThis.fMisc;
    delete globalThis['f-misc'];
    enabled = false;
}
