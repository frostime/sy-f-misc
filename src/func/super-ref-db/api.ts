import { formatSiYuanTimestamp, IResdoOperations } from "@frostime/siyuan-plugin-kits";
import { getBlockByID, request } from "@frostime/siyuan-plugin-kits/api";


function parseWsUrl(url: string) {
    const parsedUrl = new URL(url);
    const params = new URLSearchParams(parsedUrl.search);
    return {
        app: params.get('app'),
        id: params.get('id')
    };
}

export const getAvIdFromBlockId = async (blockId: BlockId) => {
    const block = await getBlockByID(blockId);
    const html = block.markdown;
    // <div data-type=\"NodeAttributeView\" data-av-id=\"20250208170718-qbemcfc\" data-av-type=\"table\"></div>
    return html.match(/data-av-id=\"(\d+)\"/)?.[1];
}

/**
 * Executes a series of transactions through a WebSocket connection.
 *
 * @param options - Configuration options for the transaction request.
 * @param options.transactions - An optional array of transaction objects, each containing 
 *                              `doOperations` and `undoOperations` arrays.
 * @param options.doOperations - An array of operations to be executed during the transaction.
 * @param options.undoOperations - An optional array of operations to be executed for undoing the 
 *                                 changes if necessary.
 *
 * @returns A promise that resolves when the transaction request is complete.
 * @example
 * ```typescript
 * await requestTransaction({
 *    transactions: [{
 *         doOperations: [{ action: "doUpdateUpdated", id: dbBlockId, data: time }],
 *         undoOperations: [{ action: "doUpdateUpdated", id: dbBlockId, data: time }]
 *     }]
 * });
 * 
 * await requestTransaction({
 *     doOperations: [{ action: "doUpdateUpdated", id: dbBlockId, data: time }]
 * });
 * ```
 */
const requestTransaction = async (options: {
    transactions?: { doOperations: any[], undoOperations: any[] }[];
    doOperations: any[];
    undoOperations?: any[];
}) => {
    const wsUrl = window.siyuan.ws.ws.url;
    const { app, id } = parseWsUrl(wsUrl);
    let transactions = [];
    if (options.transactions) transactions = options.transactions;
    else {
        if (options.doOperations) {
            transactions.push({ doOperations: options.doOperations, undoOperations: options.undoOperations ?? [] });
        }
    }
    await request('/api/transactions', {
        session: id,
        app: app,
        transactions: transactions,
        reqId: Date.now()
    });
}

export const addAttributeViewBlocks = (avId: BlockId, dbBlockId: BlockId, blockToAdd: {
    id: BlockId;
    isDetached?: boolean;
}[]) => {

    return request('/api/av/addAttributeViewBlocks', {
        avID: avId,
        blockID: dbBlockId,
        srcs: blockToAdd
    });
}


export const getAttributeViewPrimaryKeyValues = async (avId: BlockId): Promise<{
    blockIDs: BlockId[];
    name: string;
    rows: {
        key: {
            id: BlockId;
            name: string;
            type: string;
            icon: string;
            desc: string;
            numberFormat: string;
            template: string;
        };
        values: {
            id: BlockId;
            keyID: BlockId;
            blockID: BlockId;
            type: string;
            createdAt: number;
            updatedAt: number;
            block: {
                id: BlockId;
                icon: string;
                content: string;
                created: number;
                updated: number;
            };
        }[];
    };
}> => {
    return request('/api/av/getAttributeViewPrimaryKeyValues', {
        id: avId
    });
}

export const updateAttrViewName = async (options: {
    dbName: string;
    dbBlockId: BlockId;
    dvAvId?: BlockId;
}) => {
    let { dbName, dbBlockId, dvAvId } = options;

    if (!dvAvId) {
        // Get dvAvId
        dvAvId = await getAvIdFromBlockId(dbBlockId);
        if (!dvAvId) {
            return;
        }
    }

    const time = formatSiYuanTimestamp();
    const doOperations = [{
        action: "setAttrViewName",
        id: dvAvId,
        data: dbName
    }, {
        action: "doUpdateUpdated",
        id: dbBlockId,
        data: time
    }];

    const undoOperations = [{
        action: "setAttrViewName",
        id: dvAvId,
        data: ""
    }, {
        action: "doUpdateUpdated",
        id: dbBlockId,
        data: time
    }];

    await requestTransaction({
        doOperations, undoOperations
    });
}
