import { id2block } from "@frostime/siyuan-plugin-kits";
import { request } from "@frostime/siyuan-plugin-kits/api";

/**
 * Redirects first block IDs to their parent containers
 * @param inputs - Array of blocks or block IDs
 * @param enable - Configuration for heading and doc processing
 * @param enable.heading - Whether to process heading blocks
 * @param enable.doc - Whether to process document blocks
 * @returns Processed blocks or block IDs
 * @alias `redirect`
 */
export const fb2p = async (inputs: Block[], enable?: { heading?: boolean, doc?: boolean }) => {
    // 深度拷贝，防止修改原始输入
    inputs = structuredClone(inputs);
    /**
     * 处理输入参数
     */
    let types = typeof inputs[0] === 'string' ? 'id' : 'block';
    let ids = types === 'id' ? inputs : (inputs as Block[]).map(b => b.id);
    let blocks: Block[] = inputs as Block[];
    enable = { heading: true, doc: true, ...(enable ?? {}) };

    if (types == 'id') {
        //@ts-ignore
        blocks = blocks.map(id => ({ id: id }));
    }

    /**
     * 获取块的上下文关系
     */
    let data: { [key: BlockId]: any } = await request('/api/block/getBlockTreeInfos', {
        ids: ids
    });
    let result: Block[] = [];

    /**
     * 处理标题、文档块这种特殊情况；在执行 fb2p 后需要使用新的 ID 块的 content 替换旧的 ID 块的 content
     */
    let ReplaceContentTask = {
        blocks: {} as Record<BlockId, Block>,
        addTask: (block: Block) => {
            ReplaceContentTask.blocks[block.id] = block;
        },
        run: async () => {
            // let blocks = await getBlocksByIds(...Object.keys(ReplaceContentTask.blocks));
            let blocks = await id2block(Object.keys(ReplaceContentTask.blocks));
            for (let block of blocks) {
                if (ReplaceContentTask.blocks[block.id]) {
                    // replaceContentTask.blocks[block.id].content = block.content;
                    Object.assign(ReplaceContentTask.blocks[block.id], block);
                }
            }
        }
    };

    /**
     * 执行 fb2p
     */
    for (let block of blocks) {
        result.push(block);
        let info = data[block.id];
        if (info.type !== 'NodeParagraph') continue;

        /**
         * 特殊处理：文档引用标识
         * 由于「文献引用」插件的文档第一行被强行占用不能改；再考虑到确实存在在文档中进行引用的情况
         * 所以规定：如果段落中含有标签 '文档引用' 或者 'DOCREF'，则认定为文档级引用
         */
        const content = block.content.trim();
        const refPattern = /#(文档引用|DOCREF)#/;
        if (refPattern.test(content)) {
            console.debug('发现文档引用', block.id);
            let resultp = result[result.length - 1];
            resultp.id = block.root_id;
            resultp.type = 'd';
            ReplaceContentTask.addTask(resultp);
            continue;
        }

        // ---------- 以下为常规的 fb2p 处理逻辑 ----------

        if (
            info.previousID === '' &&
            ['NodeBlockquote', 'NodeListItem', 'NodeSuperBlock'].includes(info.parentType) // 容器块的第一个段落块
        ) {
            let resultp = result[result.length - 1];
            resultp.id = info.parentID;
            resultp.type = { 'NodeBlockquote': 'b', 'NodeListItem': 'i', 'NodeSuperBlock': 'sb' }[info.parentType];
        } else if (enable.heading && info.previousType === "NodeHeading") { // 标题块下方第一个段落
            let resultp = result[result.length - 1];
            resultp.id = info.previousID;
            resultp.type = 'h';
            ReplaceContentTask.addTask(resultp); // 对标题下方的段落块，执行替换 content 的任务
        } else if (
            enable.doc &&
            info.previousID === '' &&
            info.parentType === "NodeDocument"
        ) { // 文档下第一个段落
            let resultp = result[result.length - 1];
            resultp.id = info.parentID;
            resultp.type = 'd';
            ReplaceContentTask.addTask(resultp); // 对文档下面的段落块，执行替换 content 的任务
        }
    }
    await ReplaceContentTask.run();
    return result
}

export const windowRequire = (name: string) => {
    return window?.require?.(name);
}
