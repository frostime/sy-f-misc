/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-03-24 19:14:52
 * @FilePath     : /src/func/super-ref-db/api.ts
 * @LastEditTime : 2025-05-17 13:56:12
 * @Description  : 
 */
import { request } from "@frostime/siyuan-plugin-kits/api";

export const addAttributeViewBlocks = async (avId: BlockId, dbBlockId: BlockId, blockToAdd: {
    id: BlockId;
    isDetached?: boolean;
}[]) => {

    return request('/api/av/addAttributeViewBlocks', {
        avID: avId,
        blockID: dbBlockId,
        srcs: blockToAdd
    });
}


