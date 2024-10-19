/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-11 21:04:03
 * @FilePath     : /src/func/migrate-refs/move.ts
 * @LastEditTime : 2024-10-19 22:41:12
 * @Description  : 
 */

import { getChildBlocks, moveBlock, prependBlock, foldBlock, unfoldBlock, deleteBlock } from "@/api";
import { createDiary, getPastDNHPath, searchDailynote } from "@/libs/dailynote";
import { showMessage } from "siyuan";

type FuncMove = (refBlock: Block, defBlock: Block) => void;


const moveBlockToDoc = async (block: Block, docId: string) => {
    //移动块
    if (block.type === 'i') {
        //如果是列表项，需要先新建一个列表块，然后把列表项插入到列表块中
        let ans = await prependBlock('markdown',  '* ', docId);
        let newListId = ans[0].doOperations[0].id;
        await moveBlock(block.id, null, newListId);
        console.debug(`移动列表项 ${block.id} --> ${newListId}`);
        //获取新的列表的子项
        let allChild = await getChildBlocks(newListId);
        let blankItem = allChild[1]; // 上述行为会导致出现一个额外的多余列表项
        await deleteBlock(blankItem.id);
    } else if (block.type === 'h') {
        let div: HTMLDivElement = document.querySelector(`#layouts div.protyle-content div[data-node-id="${block.id}"]`);
        let fold = div.getAttribute('fold');
        if (fold != "1") {
            await foldBlock(block.id);
        }
        await moveBlock(block.id, null, docId);
        if (fold != "1") {
            //如果原来是展开的，那么移动后也展开, 等待 500ms
            setTimeout(() => {
                unfoldBlock(block.id);
            }, 500);
        }
    } else {
        await moveBlock(block.id, null, docId);
    }
}


const moveToThisDoc: FuncMove = async (refBlock: Block, defBlock: Block) => {
    if (refBlock.type === 'd') {
        showMessage(`${refBlock.content} 是文档块，不能移动到 DN 中`, 3000, 'error');
        return false;
    }

    await moveBlockToDoc(refBlock, defBlock.id);
}

const moveToChildDoc: FuncMove = async (refBlock: Block, defBlock: Block) => {

}

const moveToSamePath: FuncMove = async (refBlock: Block, defBlock: Block) => {

}

const moveToDailyNote: FuncMove = async (refBlock: Block, defBlock: Block) => {
    if (refBlock.type === 'd') {
        showMessage(`${refBlock.content} 是文档块，不能移动到 DN 中`, 3000, 'error');
        return false;
    }

    const createdTime = refBlock.created;
    const date = new Date(`${createdTime.slice(0, 4)}-${createdTime.slice(4, 6)}-${createdTime.slice(6, 8)}`);
    let dnId = await searchDailynote(defBlock.box, date);
    if (dnId === null) {
        const dnHPath = await getPastDNHPath(defBlock.box, date);
        dnId = await createDiary(defBlock.box, dnHPath, date);
    }

    await moveBlockToDoc(refBlock, dnId);
    return true;
}

/**
 * 将 refBlock 移动到 defBlock 所在的笔记本当中
 * @param refBlock 
 * @param defBlock 
 * @param type 
 * @returns 
 */
export const doMove = async (refBlock: Block, defBlock: Block, type: TMigrate) => {
    try {
        switch (type) {
            case 'no':
                return false;
            case 'thisdoc':
                return moveToThisDoc(refBlock, defBlock);
            case 'childdoc':
                return moveToChildDoc(refBlock, defBlock);
            case 'samepath':
                return moveToSamePath(refBlock, defBlock);
            case 'dailynote':
                return moveToDailyNote(refBlock, defBlock);
            default:
                return false;
        }
    } catch (e) {
        console.error(e);
        return false;
    }
}
