import { searchAttr, searchBacklinks } from "@frostime/siyuan-plugin-kits";
import { appendBlock, getBlockAttrs, getBlockByID, setBlockAttrs } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";
import { addAttributeViewBlocks, updateAttrViewName } from "./api";

// 主要是是否删掉不存在的块
type TSyncStrategy = 'keep-unlinked' | 'one-one-matched';

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
    await appendBlock('markdown', template, doc);
    await setBlockAttrs(doc, {
        'custom-bind-super-ref-db': JSON.stringify({
            block: newBlockId,
            av: newAvId
        })
    });
    // const blockId = result[0].doOperations[0].id;
    await updateAttrViewName({ dbName: `SuperRef@${document.content}`, dbBlockId: newBlockId, dvAvId: newAvId });

    await syncDatabaseFromBacklinks({ doc, database: { block: newBlockId, av: newAvId } });

    return {
        block: newBlockId,
        av: newAvId
    }
}

const getSuperRefDb = async (doc: DocumentId): Promise<{ block: BlockId, av: BlockId } | null> => {
    const attr = await getBlockAttrs(doc);
    if (!attr || !attr['custom-super-ref-db']) return;
    let data = JSON.parse(attr['custom-super-ref-db']);
    return data;
}

export const syncDatabaseFromBacklinks = async (input: {
    doc: DocumentId;
    database?: {
        block: BlockId;
        av: BlockId;
    }
}) => {
    const backlinks = await queryBacklinks(input.doc);
    if (backlinks.length == 0) return;
    let database = input.database;
    if (!database) {
        const data = await getSuperRefDb(input.doc);
        if (!data) return;
        const { block, av } = data;
        database = { block, av };
    }

    await addAttributeViewBlocks(database.av, database.block, backlinks.map((b) => ({ id: b.id, isDetached: false })));
}
