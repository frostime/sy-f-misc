import { confirmDialog, getLute, html2frag } from "@frostime/siyuan-plugin-kits";
import { getBlockAttrs, setBlockAttrs } from "@frostime/siyuan-plugin-kits/api";


import { addAttributeViewBlocks } from "./api";
import { replaceAttrViewBlock, getAttributeViewPrimaryKeyValues, removeAttributeViewBlocks } from "@/api/av";


/**
 * Calculate the differences between current refs and database rows
 * 主要是为了处理移动块的情况
 * 由于有块重定向的操作，如果把一个块移动到另一个位置，可能会造成删除原本的行而添加一个新的空白行
 * 所以需要计算重定向关系，当重定向映射发生变化的时候，重新绑定数据主键的字段
 */
const calculateDiff = async (
    superRefDbId: BlockId,
    newBlocks: Block[] | BlockId[],
    oldRowIds: string[],
    newRedirectMap?: RedirectMap
): Promise<SyncResult> => {
    const refsBlockIds = newBlocks.map(b => {
        if (typeof b === 'string') return b;
        else if (typeof b?.id === 'string') return b.id;
        else throw new Error('Invalid block type');
    });
    const refSet = new Set(refsBlockIds);
    const rowSet = new Set(oldRowIds);

    // Get the old redirect map from block attributes
    const attrs = await getBlockAttrs(superRefDbId);
    const oldRedirectMap: RedirectMap = attrs['custom-super-ref-redirect-map']
        ? JSON.parse(attrs['custom-super-ref-redirect-map'])
        : {};

    if (!newRedirectMap || Object.keys(newRedirectMap).length === 0) {
        newRedirectMap = {};
        for (const id of refsBlockIds) {
            newRedirectMap[id] = id;
        }
    }

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
    newBlocks: Block[] | BlockId[],
    redirectMap?: RedirectMap,
    removeOrphanRows?: 'remove' | 'no' | 'ask';
    askRemovePrompt?: 'SuperRef' | '动态数据库';
}) => {
    const {
        database,
        newBlocks,
        redirectMap,
        removeOrphanRows = 'ask',
        askRemovePrompt = 'SuperRef'
    } = input;

    const data = await getAttributeViewPrimaryKeyValues(database.av);
    const rowBlockIds = data?.rows.values?.map(v => v.blockID) ?? [];

    // Calculate differences
    const diff = await calculateDiff(
        database.block,
        newBlocks,
        rowBlockIds,
        redirectMap,
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
            const markdownComment = `**${askRemovePrompt}: 是否删除无用行?**

更新数据库状态的过程中发现: 部分内容块原本在数据库中，但已经不在新的查询结果中，是否需要从数据库中删除他们?

${rowsToRemove.map((row, index) => `${index + 1}. ((${row.blockID} '${row.block.content}'))`).join('\n')}
`;
            const lute = getLute();
            //@ts-ignore
            const html = `<div class="protyle-wysiwyg" style="font-size: 16px;">${lute.Md2BlockDOM(markdownComment)}</div>`;
            const element = html2frag(html);
            element.querySelectorAll('[contenteditable]').forEach((e: HTMLElement) => e.contentEditable = 'false');
            confirmDialog({
                title: askRemovePrompt + '数据库状态更新中',
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
