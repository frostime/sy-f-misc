import { searchAttr, searchBacklinks } from "@frostime/siyuan-plugin-kits";
import { getBlockAttrs, getBlockByID, prependBlock, setBlockAttrs } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";
import { addAttributeViewBlocks, getAttributeViewPrimaryKeyValues, updateAttrViewName } from "./api";

// 主要是是否删掉不存在的块
// type TSyncStrategy = 'keep-unlinked' | 'one-one-matched';

const queryBacklinks = async (doc: DocumentId) => {
    return searchBacklinks(doc, 999) || [];
}

export const createBlankSuperRefDatabase = async (doc: DocumentId) => {
    const document = await getBlockByID(doc);
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
    await setBlockAttrs(doc, {
        'custom-bind-super-ref-db': JSON.stringify({
            block: newBlockId,
            av: newAvId
        })
    });
    // const blockId = result[0].doOperations[0].id;
    await updateAttrViewName({ dbName: `SuperRef@${document.content}`, dbBlockId: newBlockId, dvAvId: newAvId });

    setTimeout(() => {
        syncDatabaseFromBacklinks({ doc, database: { block: newBlockId, av: newAvId } });
    }, 0);

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

export const syncDatabaseFromBacklinks = async (input: {
    doc: DocumentId;
    database?: {
        block: BlockId;
        av: BlockId;
    }
}) => {
    const refs = await queryBacklinks(input.doc);
    if (refs.length == 0) return;
    let database = input.database;
    if (!database) {
        const data = await getSuperRefDb(input.doc);
        if (!data) return;
        const { block, av } = data;
        database = { block, av };
    }
    const data = await getAttributeViewPrimaryKeyValues(database.av);

    let refsBlockIds = refs.map(b => b.id);
    let rowBlockIds = data.rows.values?.map(v => v.blockID) ?? [];

    // diff set
    const refSet = new Set(refsBlockIds);
    const rowSet = new Set(rowBlockIds);
    // const newBlocksToAdd = Array.from(backlinksSet).filter(id => !rowSet.has(id));
    const newRefsToAdd = refSet.difference(rowSet);
    if (newRefsToAdd.size == 0) return;
    // const existRowsToRemove = rowSet.difference(refSet);
    //TODO 考虑一下如何处理哪些已经不在反链但是还在数据库中的块

    // Add new blocks to attribute view
    // await addAttributeViewBlocks(database.av, database.block, 
    //     Array.from(newRefsToAdd).map(id => ({ id, isDetached: false }))
    // );
    await addAttributeViewBlocks(database.av, database.block,
        Array.from(refSet).map(id => ({ id, isDetached: false }))
    );

}
