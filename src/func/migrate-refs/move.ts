/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-11 21:04:03
 * @FilePath     : /src/func/migrate-refs/move.ts
 * @LastEditTime : 2024-11-03 22:17:45
 * @Description  : 
 */

import {
    getChildBlocks, moveBlock, prependBlock, foldBlock,
    unfoldBlock, deleteBlock, moveDocs, createDocWithMd,
    listDocsByPath, getIDsByHPath, sql,
    getBlockByID
} from "@/api";
import { createDiary, getPastDNHPath, searchDailynote } from "@/libs/dailynote";
import { showMessage } from "siyuan";


const moveBlockToDoc = async (block: Block, docId: string) => {
    //移动块
    if (block.type === 'i') {
        //如果是列表项，需要先新建一个列表块，然后把列表项插入到列表块中
        let ans = await prependBlock('markdown', '* ', docId);
        let newListId = ans[0].doOperations[0].id;
        await moveBlock(block.id, null, newListId);
        console.debug(`移动列表项 ${block.id} --> ${newListId}`);
        //获取新的列表的子项
        let allChild = await getChildBlocks(newListId);
        let blankItem = allChild[1]; // 上述行为会导致出现一个额外的多余列表项
        await deleteBlock(blankItem.id);
    } else if (block.type === 'h') {

        let isFolded = block.ial.search('fold="1"') !== -1;
        if (!isFolded) {
            await foldBlock(block.id);
        }
        await moveBlock(block.id, null, docId);
        if (!isFolded) {
            //如果原来是展开的，那么移动后也展开, 等待 500ms
            setTimeout(() => {
                unfoldBlock(block.id);
            }, 500);
        }
    } else {
        await moveBlock(block.id, null, docId);
    }
}

const ensureHpath = async (box: NotebookId, hpath: string) => {
    let docs = await getIDsByHPath(box, hpath);
    if (docs.length > 0) {
        return docs[0];
    }
    return null;
}

const ensurePath = async (box: NotebookId, path: string) => {
    const docs = await sql(`SELECT * FROM blocks WHERE box = '${box}' AND path = '${path}'`);
    if (docs.length > 0) {
        return docs[0].id;
    }
    return null;
}

const moveBlockAsDoc = async (block: Block, box: NotebookId, parent: {
    path?: string,
    hpath?: string
}) => {
    if (block.type === 'd' && parent?.path) {
        if (block.box === box && block.path.startsWith(parent.path.replace('.sy', ''))) {
            showMessage(`原文档已经在目标文档的目录树下, 无需重复移动`, 3000, 'error');
            return false;
        }

        if (!await ensurePath(box, parent.path)) {
            showMessage(`目标路径 ${parent.path} 不存在`, 3000, 'error');
            return false;
        }

        await moveDocs([block.path], box, parent.path);
        return true;
    }

    /* 检查内容中是否有双链
    const pattern = /\(\((\d{14}-[0-9a-z]{7}) ["'](.*)["']\)/g;
    let refs: string[] = [];
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(block.markdown)) !== null) {
        refs.push(match[0]); // 保存完整的双链
    }
    // [xxx](siyuan://blocks/20240629190950-na9p8fn)
    const mdUrl = /\[(.*)\]\(siyuan:\/\/blocks\/(\d{14}-[0-9a-z]{7})\)/g;
    match = null;
    while ((match = mdUrl.exec(block.markdown)) !== null) {
        refs.push(match[0]); // 保存完整的 md url
    }

    if (block.type === 'h') {
        await fetch('/api/filetree/heading2Doc', {
            method: 'POST',
            body: JSON.stringify({
                pushMode: 0,
                srcHeading: block.id,
                targetNoteBook: box,
                targetPath: parentPath
            })
        });
        return true;
    }*/

    if (!parent?.hpath) {
        showMessage(`无法找到目标路径 hpath`, 3000, 'error');
        return false;
    }

    if (!await ensureHpath(box, parent.hpath)) {
        showMessage(`目标路径 ${parent.hpath} 不存在`, 3000, 'error');
        return false;
    }

    const title = block.fcontent || block.content;

    let doc = await createDocWithMd(box, `${parent.hpath}/${title}`, '');
    await moveBlockToDoc(block, doc);
    return true;
}


const moveToThisDoc = async (refBlock: Block, defBlock: Block) => {
    if (refBlock.type === 'd') {
        showMessage(`${refBlock.content} 是文档块，不能移动到 DN 中`, 3000, 'error');
        return false;
    }

    await moveBlockToDoc(refBlock, defBlock.id);
    return true;
}

const moveToChildDoc = async (refBlock: Block, defBlock: Block) => {
    if (refBlock.box === defBlock.box && refBlock.path.startsWith(defBlock.path.replace('.sy', ''))) {
        showMessage(`原文档已经在目标文档的目录树下, 无需重复移动`, 3000, 'error');
        return false;
    }
    await moveBlockAsDoc(refBlock, defBlock.box, {
        path: defBlock.path,
        hpath: defBlock.hpath
    });
    return true;
}

const moveToInbox = async (refBlock: Block, defBlock: Block, inboxHpath: string = '/Inbox') => {
    let docId = await ensureHpath(defBlock.box, inboxHpath);
    if (!docId) {
        docId = await createDocWithMd(defBlock.box, inboxHpath, '');
    }

    const doc = await getBlockByID(docId);

    return await moveToChildDoc(refBlock, doc);
}

const moveToDailyNote = async (refBlock: Block, defBlock: Block) => {
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
export const doMove = async (refBlock: Block, defBlock: Block, type: TMigrate, props?: {
    inboxHpath?: string
}) => {
    try {
        switch (type) {
            case 'no':
                return false;
            case 'thisdoc':
                return moveToThisDoc(refBlock, defBlock);
            case 'childdoc':
                return moveToChildDoc(refBlock, defBlock);
            case 'inbox':
                return moveToInbox(refBlock, defBlock, props?.inboxHpath);
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
