import { confirmDialog, getLute, html2frag, searchAttr, searchBacklinks } from "@frostime/siyuan-plugin-kits";
import { getBlockAttrs, getBlockByID, prependBlock, request, setBlockAttrs } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";
import { addAttributeViewBlocks } from "./api";
import { fb2p } from "@/libs";
import { replaceAttrViewBlock, updateAttrViewName, getAttributeViewPrimaryKeyValues, removeAttributeViewBlocks } from "@/api/av";

// 主要是是否删掉不存在的块
// type TSyncStrategy = 'keep-unlinked' | 'one-one-matched';

export const configs = {
    doRedirect: true
}

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
    if (!attr || !attr['custom-bind-super-ref-db']) return null;
    let data = JSON.parse(attr['custom-bind-super-ref-db']);
    let { block, av } = data;
    if (!block || !av) return null;
    const findDoc = await getBlockByID(block);
    if (!findDoc) return null;
    return data;
}

type RedirectMap = Record<BlockId, BlockId>; // refID -> backlinkID

interface SyncResult {
    toAdd: { id: string; isDetached: boolean; }[];
    toDelete: string[];
    toRedirect: { from: string; to: string; }[];
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
 * Calculate the differences between current refs and database rows
 * 主要是为了处理移动块的情况
 * 由于有块重定向的操作，如果把一个块移动到另一个位置，可能会造成删除原本的行而添加一个新的空白行
 * 所以需要计算重定向关系，当重定向映射发生变化的时候，重新绑定数据主键的字段
 */
const calculateDiff = async (
    superRefDbId: BlockId,
    refs: Block[],
    rowBlockIds: string[],
    newRedirectMap: RedirectMap
): Promise<SyncResult> => {
    const refsBlockIds = refs.map(b => b.id);
    const refSet = new Set(refsBlockIds);
    const rowSet = new Set(rowBlockIds);

    // Get the old redirect map from block attributes
    const attrs = await getBlockAttrs(superRefDbId);
    const oldRedirectMap: RedirectMap = attrs['custom-super-ref-redirect-map']
        ? JSON.parse(attrs['custom-super-ref-redirect-map'])
        : {};

    // Update the redirect map in block attributes
    await setBlockAttrs(superRefDbId, {
        'custom-super-ref-redirect-map': JSON.stringify(newRedirectMap)
    });

    // console.log('Redirect map:');
    // console.log(oldRedirectMap);
    // console.log(newRedirectMap);

    let result: SyncResult = {
        toAdd: [] as { id: BlockId; isDetached: boolean; }[],
        toDelete: [] as BlockId[],
        toRedirect: [] as { from: BlockId; to: BlockId; }[]
    };

    // Calculate basic additions and deletions
    // if (addNewRefsStrategy === 'add-diff') {
    //     const newRefsToAdd = refSet.difference(rowSet);
    //     result.toAdd = Array.from(newRefsToAdd).map(id => ({ id, isDetached: false }));
    // } else { // add-all
    //     result.toAdd = Array.from(refSet).map(id => ({ id, isDetached: false }));
    // }
    const newRefsToAdd = refSet.difference(rowSet);
    result.toAdd = Array.from(newRefsToAdd).map(id => ({ id, isDetached: false }));

    const orphanRows = rowSet.difference(refSet);
    result.toDelete = Array.from(orphanRows);

    // Find redirections by matching deletions and additions that point to the same original block
    const redirections: { from: BlockId; to: BlockId; }[] = [];

    for (const toDelete of result.toDelete) {
        const originalBlock = oldRedirectMap[toDelete];
        if (!originalBlock) continue;

        // Find if there's a matching addition that points to the same original block
        const matchingAdd = result.toAdd.find(({ id }) => newRedirectMap[id] === originalBlock);
        if (!matchingAdd) continue;

        redirections.push({
            from: toDelete,
            to: matchingAdd.id
        });

        // Remove from both add and delete lists since this is a redirection
        result.toAdd = result.toAdd.filter(item => item.id !== matchingAdd.id);
        result.toDelete = result.toDelete.filter(id => id !== toDelete);
    }

    result.toRedirect = redirections;
    return result;
}

/**
 * Search blocks with optional redirection
 * This function handles the search operation and redirection if needed
 * 
 * @param searchFn - Async function that returns blocks from search
 * @param redirectStrategy - Redirection strategy, 'none' or 'fb2p'
 * @returns - Object containing refs (possibly redirected blocks) and redirectMap
 */
export const searchBlocksWithRedirect = async (
    searchFn: () => Promise<any[]>,
    redirectStrategy: 'none' | 'fb2p' = 'none'
): Promise<{ refs: Block[], redirectMap: RedirectMap }> => {
    const blocks = await searchFn();
    return handleRedirection(blocks as Block[], redirectStrategy);
}

/**
 * Sync database content with search results
 * 
 * @param input - Input parameters
 * @param input.database - Database object containing block and av IDs
 * @param input.refs - Block references to sync to the database
 * @param input.redirectMap - Redirection map for blocks
 * @param input.removeOrphanRows - Strategy for handling orphan rows
 * @returns - Void
 */
export const syncDatabaseFromSearchResults = async (input: {
    database: {
        block: BlockId;
        av: BlockId;
    },
    refs: Block[],
    redirectMap?: RedirectMap,
    removeOrphanRows?: 'remove' | 'no' | 'ask';
}) => {
    const {
        database,
        refs,
        redirectMap,
        removeOrphanRows = 'ask'
    } = input;

    const data = await getAttributeViewPrimaryKeyValues(database.av);
    const rowBlockIds = data?.rows.values?.map(v => v.blockID) ?? [];

    // Calculate differences
    const diff = await calculateDiff(
        database.block,
        refs,
        rowBlockIds,
        redirectMap ?? {},
    );

    // Handle additions
    if (diff.toAdd.length > 0) {
        // console.debug(`Add SuperRef:`, diff.toAdd);
        await addAttributeViewBlocks(database.av, database.block, diff.toAdd);
    }

    // Handle redirections
    if (diff.toRedirect.length > 0) {
        // console.debug(`Redirect SuperRef:`, diff.toRedirect);
        for (const { from, to } of diff.toRedirect) {
            await replaceAttrViewBlock({
                avId: database.av,
                previousId: from,
                nextId: to,
                isDetached: false
            })
        }
    }

    // Handle deletions
    if (diff.toDelete.length > 0 && removeOrphanRows !== 'no') {
        // await removeAttributeViewBlocks(database.av, diff.toDelete);
        const orphanRowIds = diff.toDelete;
        const rowsToRemove = data.rows.values?.filter(row => orphanRowIds.includes(row.blockID)) ?? [];
        if (rowsToRemove.length === 0) return;

        if (removeOrphanRows === 'ask') {
            const markdownComment = `
以下行已经不再链接到本文档，是否需要删除他们?

${rowsToRemove.map((row, index) => `${index + 1}. ((${row.blockID} '${row.block.content}'))`).join('\n')}
`;
            const lute = getLute();
            //@ts-ignore
            const html = `<div class="protyle-wysiwyg" style="font-size: 16px;">${lute.Md2BlockDOM(markdownComment)}</div>`;
            const element = html2frag(html);
            element.querySelectorAll('[contenteditable]').forEach((e: HTMLElement) => e.contentEditable = 'false');
            confirmDialog({
                title: '是否删除无用行?',
                content: element,
                confirm: async () => {
                    await removeAttributeViewBlocks(database.av, rowsToRemove.map(row => row.blockID));
                }
            });
        } else if (removeOrphanRows === 'remove') {
            await removeAttributeViewBlocks(database.av, rowsToRemove.map(row => row.blockID));
        }
    }
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
        refs,
        redirectMap,
        removeOrphanRows
    });
}
