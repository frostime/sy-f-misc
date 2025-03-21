import { request } from "@frostime/siyuan-plugin-kits/api";


// export const getAttributeView = async (avID: BlockId) => {
//     return request('/api/av/getAttributeView', {
//         id: avID
//     });
// }

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

// export const removeAttributeViewBlocks = async (avId: BlockId, blockIds: BlockId[]) => {
//     return request('/api/av/removeAttributeViewBlocks', {
//         avID: avId,
//         srcIDs: blockIds
//     });
// }

// export const getAttributeViewPrimaryKeyValues = async (avId: BlockId): Promise<{
//     blockIDs: BlockId[];
//     name: string;
//     rows: {
//         key: {
//             id: BlockId;
//             name: string;
//             type: string;
//             icon: string;
//             desc: string;
//             numberFormat: string;
//             template: string;
//         };
//         values: {
//             id: BlockId;
//             keyID: BlockId;
//             blockID: BlockId;
//             type: string;
//             createdAt: number;
//             updatedAt: number;
//             block: {
//                 id: BlockId;
//                 icon: string;
//                 content: string;
//                 created: number;
//                 updated: number;
//             };
//         }[];
//     };
// }> => {
//     return request('/api/av/getAttributeViewPrimaryKeyValues', {
//         id: avId
//     });
// }
