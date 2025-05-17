/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-03-27 15:40:25
 * @FilePath     : /src/func/super-ref-db/super-ref.ts
 * @LastEditTime : 2025-05-16 20:20:11
 * @Description  : 
 */
import { searchAttr, searchBacklinks } from "@frostime/siyuan-plugin-kits";
import { getBlockAttrs, getBlockByID, prependBlock, request, setBlockAttrs } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";

import { fb2p } from "@/libs";
import { updateAttrViewName } from "@/api/av";
import { syncDatabaseFromSearchResults } from "./core";

export const SUPER_REF_DB_ATTR = 'custom-super-ref-db';

const queryBacklinks = async (doc: DocumentId, limit: number = 999) => {
    const backlinks = await searchBacklinks(doc, limit) || [];
    return backlinks.filter(block => block.type !== 'query_embed');
}

export const createBlankSuperRefDatabase = async (doc: DocumentId) => {
    const document = await getBlockByID(doc);
    if (!document) {
        showMessage('无法找到对应文档', 3000, 'error');
        return;
    }
    const existed = await searchAttr('custom-super-ref-db', doc, '=');
    if (existed && existed?.length > 0) {
        if (existed.length == 1) {
            return;
        } else {
            showMessage('注意! 文档绑定了多个超级引用数据库!', 3000, 'error');
            return;
        }
    }
    let newBlockId = window.Lute.NewNodeID();
    let newAvId = window.Lute.NewNodeID();
    const template = `
<div data-type="NodeAttributeView" data-av-id="${newAvId}" data-av-type="table"></div>
{: id="${newBlockId}" custom-super-ref-db="${doc}" }
`;
    await prependBlock('markdown', template, doc);
    // https://github.com/siyuan-note/siyuan/issues/14037#issuecomment-2646869586
    await request('/api/av/renderAttributeView', {
        "id": newAvId,
        "viewID": "",
        "query": ""
    });
    await setBlockAttrs(doc, {
        'custom-bind-super-ref-db': JSON.stringify({
            block: newBlockId,
            av: newAvId
        })
    });

    setTimeout(async () => {
        let dbname = document.name ? `SuperRef@${document.name}` : `SuperRef@${document.content}`;
        await syncDatabaseFromBacklinks({ doc, database: { block: newBlockId, av: newAvId } });
        await updateAttrViewName({ dbName: dbname, dbBlockId: newBlockId, dvAvId: newAvId });
    }, 100);

    return {
        block: newBlockId,
        av: newAvId
    }
}

export const getSuperRefDb = async (doc: DocumentId): Promise<{ block: BlockId, av: BlockId } | null> => {
    const attr = await getBlockAttrs(doc);
    // Document 的属性，用来标识绑定的 SuperRef 数据库
    if (!attr || !attr['custom-bind-super-ref-db']) return null;
    let data = JSON.parse(attr['custom-bind-super-ref-db']);
    let { block, av } = data;
    if (!block || !av) return null;
    const findDoc = await getBlockByID(block);
    if (!findDoc) return null;
    return data;
}


const handleRedirection = async (
    backlinks: Block[],
    redirectStrategy: 'none' | 'fb2p',
): Promise<{ refs: Block[], redirectMap: RedirectMap }> => {
    let refs: Block[] = [];
    let redirectMap: RedirectMap = {};

    if (redirectStrategy === 'fb2p' && backlinks.length > 0) {
        refs = await fb2p(backlinks, {
            heading: true,
            doc: true
        });
    } else {
        refs = backlinks;
    }
    // Build redirect map
    refs.forEach((ref, index) => {
        redirectMap[ref.id] = backlinks[index].id;
    });

    return { refs, redirectMap };
}

/**
 * Search blocks with optional redirection
 * This function handles the search operation and redirection if needed
 * 
 * @param searchFn - Async function that returns blocks from search
 * @param redirectStrategy - Redirection strategy, 'none' or 'fb2p'
 * @returns - Object containing refs (possibly redirected blocks) and redirectMap
 */
const searchBlocksWithRedirect = async (
    searchFn: () => Promise<any[]>,
    redirectStrategy: 'none' | 'fb2p' = 'none'
): Promise<{ refs: Block[], redirectMap: RedirectMap }> => {
    const blocks = await searchFn();
    return handleRedirection(blocks as Block[], redirectStrategy);
}


/**
 * 同步反向链接数据库
 * 
 * @param input - 输入参数对象
 * @param input.doc - 文档ID
 * @param input.database - 可选的数据库对象, 包含 block 和 av ID
 * @returns - 无返回值
 */
export const syncDatabaseFromBacklinks = async (input: {
    doc: DocumentId;
    database?: {
        block: BlockId;
        av: BlockId;
    },
    redirectStrategy?: 'none' | 'fb2p';
    removeOrphanRows?: 'remove' | 'no' | 'ask';
}) => {
    const {
        redirectStrategy = 'fb2p',
        removeOrphanRows = 'ask'
    } = input;

    // Search for backlinks with redirection
    const { refs, redirectMap } = await searchBlocksWithRedirect(
        () => queryBacklinks(input.doc),
        redirectStrategy
    );

    // Get database info if not provided
    let database = input.database;
    if (!database) {
        const data = await getSuperRefDb(input.doc);
        if (!data) return;
        const { block, av } = data;
        database = { block, av };
    }

    // Sync database with search results
    await syncDatabaseFromSearchResults({
        database,
        newBlocks: refs,
        redirectMap,
        removeOrphanRows
    });
}
