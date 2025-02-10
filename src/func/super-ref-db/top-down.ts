import { confirmDialog, getLute, html2frag, searchAttr, searchBacklinks } from "@frostime/siyuan-plugin-kits";
import { getBlockAttrs, getBlockByID, prependBlock, request, setBlockAttrs } from "@frostime/siyuan-plugin-kits/api";
import { showMessage } from "siyuan";
import { addAttributeViewBlocks, getAttributeViewPrimaryKeyValues, removeAttributeViewBlocks, updateAttrViewName } from "./api";
import { fb2p } from "@/libs";

// 主要是是否删掉不存在的块
// type TSyncStrategy = 'keep-unlinked' | 'one-one-matched';

const queryBacklinks = async (doc: DocumentId) => {
    return searchBacklinks(doc, 999) || [];
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
        await syncDatabaseFromBacklinks({ doc, database: { block: newBlockId, av: newAvId }, addNewRefsStrategy: 'add-all' });
        await updateAttrViewName({ dbName: `SuperRef@${document.content}`, dbBlockId: newBlockId, dvAvId: newAvId });
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


/**
 * 同步反向链接数据库
 * 
 * @param input - 输入参数对象
 * @param input.doc - 文档ID
 * @param input.database - 可选的数据库对象, 包含 block 和 av ID
 * @param input.addNewRefsStrategy - 添加新引用的策略
 *                                - 'add-diff': 只添加不在数据库中的新引用
 *                                - 'add-all': 重新添加所有引用
 *                                默认为 'add-diff'
 * @param input.orphanRowsStrategy - 处理孤儿行的策略
 *                                - 'keep': 保留在数据库中的孤儿行
 *                                - 'remove': 删除不再有引用的行
 *                                默认为 'keep'
 * @returns - 无返回值
 */
export const syncDatabaseFromBacklinks = async (input: {
    doc: DocumentId;
    database?: {
        block: BlockId;
        av: BlockId;
    },
    redirectStrategy?: 'none' | 'fb2p';
    addNewRefsStrategy?: 'add-diff' | 'add-all';
    orphanRowsStrategy?: 'keep' | 'remove';
}) => {
    const {
        addNewRefsStrategy = 'add-diff',
        orphanRowsStrategy = 'keep',
        redirectStrategy = 'fb2p'
    } = input;

    let backlinks = await queryBacklinks(input.doc) as Block[];

    // 重定向反向链接
    let refs = [];
    if (redirectStrategy == 'fb2p' && backlinks.length > 0) {
        refs = await fb2p(backlinks, {
            heading: true,
            doc: true
        });
    } else {
        refs = backlinks;
    }

    let database = input.database;
    if (!database) {
        const data = await getSuperRefDb(input.doc);
        if (!data) return;
        const { block, av } = data;
        database = { block, av };
    }
    const data = await getAttributeViewPrimaryKeyValues(database.av);

    let refsBlockIds = refs.map(b => b.id);
    let rowBlockIds = data?.rows.values?.map(v => v.blockID) ?? [];

    // diff set
    const refSet = new Set(refsBlockIds);
    const rowSet = new Set(rowBlockIds);

    // 处理新引用
    let blocksToAdd: { id: string; isDetached: boolean; }[] = [];
    if (addNewRefsStrategy === 'add-diff') {
        const newRefsToAdd = refSet.difference(rowSet);
        blocksToAdd = Array.from(newRefsToAdd).map(id => ({ id, isDetached: false }));
    } else { // add-all
        blocksToAdd = Array.from(refSet).map(id => ({ id, isDetached: false }));
    }

    if (blocksToAdd.length > 0) {
        await addAttributeViewBlocks(database.av, database.block, blocksToAdd);
    }

    // 处理孤儿行
    if (orphanRowsStrategy === 'remove') {
        const orphanRows = rowSet.difference(refSet);
        if (orphanRows.size > 0) {
            const orphanRowIds = Array.from(orphanRows);
            const rowsToRemove = data.rows.values?.filter(row => orphanRowIds.includes(row.blockID)) ?? [];
            if (rowsToRemove.length > 0) {
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
            }
        }
    }
}
