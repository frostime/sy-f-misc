/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-21 20:25:51
 * @FilePath     : /src/func/bookmarks/utils.ts
 * @LastEditTime : 2024-05-28 16:29:01
 * @Description  : 
 */
import { NodeIcons, BlockType2NodeType } from "@/utils/const";

export const ClassName = {
    Group: 'custom-bookmark-group',
    GroupHeader: 'custom-bookmark-group-header',
    GroupList: 'custom-bookmark-group-list',
    Item: 'custom-bookmark-item'
}

export const parseEmoji = (code: string) => {
    let codePoint = parseInt(code, 16);
    if (Number.isNaN(codePoint)) return '📄';
    return String.fromCodePoint(codePoint);
}

export const buildItemDetail = (block: IBookmarkItemInfo) => {
    // console.debug("::buildItemDetail", block);
    let nodetype = BlockType2NodeType[block.type];
    let icon: any;
    if (nodetype === "NodeDocument") {
        icon = `<span data-defids="[&quot;&quot;]" class="b3-list-item__graphic popover__block" data-id="${block.id}" style="font-size: 14px;">${parseEmoji(block.icon)}</span>`;
    } else {
        icon = NodeIcons[nodetype];
        if (icon?.subtypes?.[block?.subtype]) {
            icon = icon.subtypes[block.subtype].icon;
        } else {
            icon = icon?.icon ?? "iconFile";
        }
        icon = `<svg data-defids="[&quot;&quot;]" class="b3-list-item__graphic popover__block" data-id="${block.id}"><use xlink:href="#${icon}"></use></svg>`;
    }
    return {
        NodeType: nodetype,
        Icon: icon,
    };
};
