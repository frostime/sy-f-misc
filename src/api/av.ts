import { formatSiYuanTimestamp } from "@frostime/siyuan-plugin-kits";
import { getBlockByID, request } from "@frostime/siyuan-plugin-kits/api";


type AvID = BlockId;

/**
 * Type definitions for attribute view related structures
 */
export interface AttributeViewKey {
    id: string;
    name: string;
    type: string;
    icon: string;
    desc?: string;
    numberFormat?: string;
    template?: string;
}

export interface AttributeViewValue {
    id: string;
    keyID: string;
    blockID: string;
    type: string;
    createdAt: number;
    updatedAt: number;
    content?: any;
    block?: {
        id: string;
        icon: string;
        content: string;
        created: number;
        updated: number;
    };
}

export interface AttributeViewRow {
    key: AttributeViewKey;
    values: AttributeViewValue[];
}

export interface AttributeView {
    id: string;
    name: string;
    viewID?: string;
    viewType?: string;
    views?: Array<{
        id: string;
        icon: string;
        name: string;
        hideAttrViewName: boolean;
        type: string;
        pageSize?: number;
        desc?: string;
    }>;
    isMirror?: boolean;
    view?: any;
}

export interface AttributeViewFilter {
    column: string;
    operator: string;
    value: any;
}

export interface AttributeViewSort {
    column: string;
    order: string;
}

/**
 * Parse WebSocket URL to extract app and id parameters
 * @param url WebSocket URL
 * @returns Object containing app and id parameters
 */
function parseWsUrl(url: string) {
    const parsedUrl = new URL(url);
    const params = new URLSearchParams(parsedUrl.search);
    return {
        app: params.get('app'),
        id: params.get('id')
    };
}

/**
 * Extract attribute view ID from a block
 * @param blockId Block ID
 * @returns Attribute view ID
 */
export const getAvIdFromBlockId = async (blockId: BlockId) => {
    const block = await getBlockByID(blockId);
    const html = block.markdown;
    // <div data-type="NodeAttributeView" data-av-id="20250208170718-qbemcfc" data-av-type="table"></div>
    return html.match(/data-av-id=\"([^\"]+)\"/)?.[1];
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
export const requestTransaction = async (options: {
    transactions?: { doOperations: any[], undoOperations: any[] }[];
    doOperations?: any[];
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

/**
 * Get attribute view data by ID
 * @param avID Attribute view ID
 * @returns Promise with the attribute view data
 */
export const getAttributeView = async (avID: AvID): Promise<AttributeView> => {
    const result = await request('/api/av/getAttributeView', {
        id: avID
    });
    return result.data.av;
}

/**
 * Add blocks to an attribute view
 * @param avId Attribute view ID
 * @param blockID Block ID (optional)
 * @param blocksToAdd Array of blocks to add
 * @param previousID Previous block ID (optional)
 * @param ignoreFillFilter Whether to ignore fill filter (default: true)
 * @returns Promise with the result
 */
export const addAttributeViewBlocks = async (
    avId: AvID, 
    blocksToAdd: {
        id: BlockId;
        isDetached?: boolean;
    }[],
    blockID: BlockId = "", 
    previousID: string = "",
    ignoreFillFilter?: boolean
) => {
    return request('/api/av/addAttributeViewBlocks', {
        avID: avId,
        blockID: blockID,
        srcs: blocksToAdd,
        previousID: previousID,
        ignoreFillFilter: ignoreFillFilter
    });
}

/**
 * Remove blocks from an attribute view
 * @param avId Attribute view ID
 * @param blockIds Array of block IDs to remove
 * @returns Promise with the result
 */
export const removeAttributeViewBlocks = async (avId: AvID, blockIds: BlockId[]) => {
    return request('/api/av/removeAttributeViewBlocks', {
        avID: avId,
        srcIDs: blockIds
    });
}

/**
 * Get primary key values from an attribute view
 * @param avId Attribute view ID
 * @param keyword Search keyword (optional)
 * @param page Page number (optional, default: 1)
 * @param pageSize Page size (optional, default: -1 for all)
 * @returns Promise with attribute view primary key values
 */
export const getAttributeViewPrimaryKeyValues = async (
    avId: AvID,
    keyword: string = "",
    page: number = 1,
    pageSize: number = -1
): Promise<{
    blockIDs: BlockId[];
    name: string;
    rows: AttributeViewRow;
}> => {
    return request('/api/av/getAttributeViewPrimaryKeyValues', {
        id: avId,
        keyword: keyword,
        page: page,
        pageSize: pageSize
    });
}

/**
 * Update attribute view name
 * @param options Options for updating attribute view name
 * @returns Promise with the result
 */
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

/**
 * Replace a block in an attribute view
 * @param options Options for replacing a block
 * @returns Promise with the result
 */
export const replaceAttrViewBlock = async (options: {
    avId: AvID;
    previousId: BlockId;
    nextId: BlockId;
    isDetached?: boolean;
}) => {
    const { avId, previousId, nextId, isDetached = false } = options;
    const payload = {
        "doOperations": [
            {
                "action": "replaceAttrViewBlock",
                "avID": avId,
                "previousID": previousId,
                "nextID": nextId,
                "isDetached": isDetached
            }
        ],
        "undoOperations": [
            {
                "action": "replaceAttrViewBlock",
                "avID": avId,
                "previousID": previousId,
                "nextID": nextId,
                "isDetached": isDetached
            }
        ]
    }
    return requestTransaction(payload);
}

/**
 * Duplicate an attribute view block
 * @param avID Attribute view ID
 * @returns Promise with the new attribute view ID and block ID
 */
export const duplicateAttributeViewBlock = async (avID: AvID): Promise<{
    avID: AvID;
    blockID: BlockId;
}> => {
    const result = await request('/api/av/duplicateAttributeViewBlock', {
        avID: avID
    });
    return result.data;
}

/**
 * Get attribute view keys by attribute view ID
 * @param avID Attribute view ID
 * @returns Promise with the attribute view keys
 */
export const getAttributeViewKeysByAvID = async (avID: AvID): Promise<AttributeViewKey[]> => {
    const result = await request('/api/av/getAttributeViewKeysByAvID', {
        avID: avID
    });
    return result.data;
}

/**
 * Get mirror database blocks
 * @param avID Attribute view ID
 * @returns Promise with the mirror database blocks
 */
export const getMirrorDatabaseBlocks = async (avID: AvID): Promise<{
    refDefs: Array<{
        refID: string;
        defIDs: string[];
    }>;
}> => {
    const result = await request('/api/av/getMirrorDatabaseBlocks', {
        avID: avID
    });
    return result.data;
}

/**
 * Set database block view
 * @param blockID Block ID
 * @param viewID View ID
 * @returns Promise with the result
 */
export const setDatabaseBlockView = async (blockID: BlockId, viewID: string) => {
    return request('/api/av/setDatabaseBlockView', {
        id: blockID,
        viewID: viewID
    });
}

/**
 * Append attribute view detached blocks with values
 * @param avID Attribute view ID
 * @param blocksValues Array of block values
 * @returns Promise with the result
 */
export const appendAttributeViewDetachedBlocksWithValues = async (
    avID: AvID, 
    blocksValues: any[][]
) => {
    return request('/api/av/appendAttributeViewDetachedBlocksWithValues', {
        avID: avID,
        blocksValues: blocksValues
    });
}

/**
 * Add an attribute view key
 * @param avID Attribute view ID
 * @param keyID Key ID
 * @param keyName Key name
 * @param keyType Key type
 * @param keyIcon Key icon
 * @param previousKeyID Previous key ID
 * @returns Promise with the result
 */
export const addAttributeViewKey = async (
    avID: AvID,
    keyID: string,
    keyName: string,
    keyType: string,
    keyIcon: string,
    previousKeyID: string
) => {
    return request('/api/av/addAttributeViewKey', {
        avID: avID,
        keyID: keyID,
        keyName: keyName,
        keyType: keyType,
        keyIcon: keyIcon,
        previousKeyID: previousKeyID
    });
}

/**
 * Remove an attribute view key
 * @param avID Attribute view ID
 * @param keyID Key ID
 * @param removeRelationDest Whether to remove relation destination (default: false)
 * @returns Promise with the result
 */
export const removeAttributeViewKey = async (
    avID: AvID,
    keyID: string,
    removeRelationDest: boolean = false
) => {
    return request('/api/av/removeAttributeViewKey', {
        avID: avID,
        keyID: keyID,
        removeRelationDest: removeRelationDest
    });
}

/**
 * Sort attribute view view key
 * @param avID Attribute view ID
 * @param keyID Key ID
 * @param previousKeyID Previous key ID
 * @param viewID View ID (optional)
 * @returns Promise with the result
 */
export const sortAttributeViewViewKey = async (
    avID: AvID,
    keyID: string,
    previousKeyID: string,
    viewID: string = ""
) => {
    return request('/api/av/sortAttributeViewViewKey', {
        avID: avID,
        viewID: viewID,
        keyID: keyID,
        previousKeyID: previousKeyID
    });
}

/**
 * Sort attribute view key
 * @param avID Attribute view ID
 * @param keyID Key ID
 * @param previousKeyID Previous key ID
 * @returns Promise with the result
 */
export const sortAttributeViewKey = async (
    avID: AvID,
    keyID: string,
    previousKeyID: string
) => {
    return request('/api/av/sortAttributeViewKey', {
        avID: avID,
        keyID: keyID,
        previousKeyID: previousKeyID
    });
}

/**
 * Get attribute view filter and sort
 * @param avID Attribute view ID
 * @param blockID Block ID
 * @returns Promise with the filters and sorts
 */
export const getAttributeViewFilterSort = async (
    avID: AvID, 
    blockID: BlockId
): Promise<{
    filters: AttributeViewFilter[];
    sorts: AttributeViewSort[];
}> => {
    const result = await request('/api/av/getAttributeViewFilterSort', {
        id: avID,
        blockID: blockID
    });
    return result.data;
}

/**
 * Search attribute view non-relation key
 * @param avID Attribute view ID
 * @param keyword Search keyword
 * @returns Promise with the non-relation keys
 */
export const searchAttributeViewNonRelationKey = async (
    avID: AvID, 
    keyword: string
): Promise<{
    keys: AttributeViewKey[];
}> => {
    const result = await request('/api/av/searchAttributeViewNonRelationKey', {
        avID: avID,
        keyword: keyword
    });
    return result.data;
}

/**
 * Search attribute view relation key
 * @param avID Attribute view ID
 * @param keyword Search keyword
 * @returns Promise with the relation keys
 */
export const searchAttributeViewRelationKey = async (
    avID: AvID, 
    keyword: string
): Promise<{
    keys: AttributeViewKey[];
}> => {
    const result = await request('/api/av/searchAttributeViewRelationKey', {
        avID: avID,
        keyword: keyword
    });
    return result.data;
}

/**
 * Search attribute view
 * @param keyword Search keyword
 * @param excludes Array of attribute view IDs to exclude (optional)
 * @returns Promise with the search results
 */
export const searchAttributeView = async (
    keyword: string, 
    excludes: string[] = []
): Promise<{
    results: AttributeView[];
}> => {
    const result = await request('/api/av/searchAttributeView', {
        keyword: keyword,
        excludes: excludes
    });
    return result.data;
}

/**
 * Render snapshot attribute view
 * @param snapshot Snapshot index
 * @param id Attribute view ID
 * @returns Promise with the rendered attribute view
 */
export const renderSnapshotAttributeView = async (
    snapshot: string, 
    id: BlockId
): Promise<AttributeView> => {
    const result = await request('/api/av/renderSnapshotAttributeView', {
        snapshot: snapshot,
        id: id
    });
    return result.data;
}

/**
 * Render history attribute view
 * @param id Attribute view ID
 * @param created Created timestamp
 * @returns Promise with the rendered attribute view
 */
export const renderHistoryAttributeView = async (
    id: BlockId, 
    created: string
): Promise<AttributeView> => {
    const result = await request('/api/av/renderHistoryAttributeView', {
        id: id,
        created: created
    });
    return result.data;
}

/**
 * Render attribute view
 * @param id Attribute view ID
 * @param viewID View ID (optional)
 * @param query Query string (optional)
 * @param page Page number (optional, default: 1)
 * @param pageSize Page size (optional, default: -1 for all)
 * @returns Promise with the rendered attribute view
 */
export const renderAttributeView = async (
    id: BlockId,
    viewID: string = "",
    query: string = "",
    page: number = 1,
    pageSize: number = -1
): Promise<AttributeView> => {
    const result = await request('/api/av/renderAttributeView', {
        id: id,
        viewID: viewID,
        query: query,
        page: page,
        pageSize: pageSize
    });
    return result.data;
}

/**
 * Get attribute view keys
 * @param id Attribute view ID
 * @returns Promise with the attribute view keys
 */
export const getAttributeViewKeys = async (id: BlockId): Promise<AttributeViewKey[]> => {
    const result = await request('/api/av/getAttributeViewKeys', {
        id: id
    });
    return result.data;
}

/**
 * Set attribute view block attribute
 * @param avID Attribute view ID
 * @param keyID Key ID
 * @param rowID Row ID
 * @param value Cell value
 * @returns Promise with the updated value
 */
export const setAttributeViewBlockAttr = async (
    avID: AvID,
    keyID: string,
    rowID: string,
    value: any
): Promise<{
    value: any;
}> => {
    const result = await request('/api/av/setAttributeViewBlockAttr', {
        avID: avID,
        keyID: keyID,
        rowID: rowID,
        value: value
    });
    return result.data;
}