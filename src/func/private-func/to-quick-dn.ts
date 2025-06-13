import { getChildBlocks } from "@/api";
import { searchAttr, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { moveBlock } from "@frostime/siyuan-plugin-kits/api";

const moveToQuickDn = async (srcBlocks: BlockId[]) => {

    // attr
    let name = 'custom-dn-quickh2';

    let today = new Date();
    let year = today.getFullYear();
    let month = (today.getMonth() + 1).toString().padStart(2, '0');
    let day = today.getDate().toString().padStart(2, '0');
    let v = `${year}${month}${day}`;


    // Get target
    let h2 = await searchAttr(name, v);
    if (h2.length !== 1) return;
    let id = h2[0].id;

    // 移动
    const children = await getChildBlocks(id);
    let target;
    if (children.length === 0) {
        target = id;
    } else {
        target = children[children.length - 1].id;
    }
    for (let block of srcBlocks) {
        await moveBlock(block, target, null);
        target = block;
    }
}

let disposers: (() => void) = () => {};

export const load = () => {
    const plugin = thisPlugin();
    disposers = plugin.registerOnClickBlockicon((details) => {
        details.menu.addItem({
            label: '移动到快速日记',
            icon: 'iconMove',
            click: () => {
                moveToQuickDn(details.blocks.map(block => block.id));
            }
        })
    })
}

export const unload = () => {
    disposers();
}

