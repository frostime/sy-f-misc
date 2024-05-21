/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-19 21:51:09
 * @FilePath     : /src/func/bookmarks/component.ts
 * @LastEditTime : 2024-05-21 20:37:42
 * @Description  : 
 */
import { Constants, Menu } from "siyuan";

import { html2ele } from "@/utils";
import BookmarkDataModal from "./modal";
import { inputDialog, inputDialogSync } from "@/components/dialog";
import { getBlockByID } from "@/api";

import { BlockType2NodeType, NodeIcons } from "@/utils/const";

export let template = `
<div class="fn__flex-1 fn__flex-column file-tree sy__bookmark" id="custom-bookmark-element">
    <div class="block__icons">
        <div class="block__logo">
            <svg class="block__logoicon">
                <use xlink:href="#iconBookmark"></use>
            </svg>
            书签
        </div>
        <span class="fn__flex-1"></span>
        <span class="fn__space"></span>
        <span data-type="add" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="添加书签组">
            <svg class="">
                <use xlink:href="#iconAdd"></use>
            </svg>
        </span>
        <span class="fn__space"></span>
        <span data-type="refresh" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="刷新">
            <svg class="">
                <use xlink:href="#iconRefresh"></use>
            </svg>
        </span>
        <span class="fn__space"></span>
        <span data-type="expand" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="展开 Ctrl+↓">
            <svg>
                <use xlink:href="#iconExpand"></use>
            </svg>
        </span>
        <span class="fn__space"></span>
        <span data-type="collapse" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="折叠 Ctrl+↑">
            <svg>
                <use xlink:href="#iconContract"></use>
            </svg>
        </span>
        <span class="fn__space"></span>
        <span data-type="min" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="最小化 Ctrl+W">
            <svg>
                <use xlink:href="#iconMin"></use>
            </svg>
        </span>
    </div>
    <div class="fn__flex-1" style="margin-bottom: 8px">
        <ul class="b3-list b3-list--background" id="custom-bookmark-body">

        </ul>
    </div>
</div>
`;

const ClassName = {
    Group: 'custom-bookmark-group',
    GroupHeader: 'custom-bookmark-group-header',
    GroupList: 'custom-bookmark-group-list',
    Item: 'custom-bookmark-item'
}

const buildItemDetail = (block: {
    id: BlockId, type: BlockType, subtype?: BlockSubType
}) => {
    let nodetype = BlockType2NodeType[block.type];
    let icon: any;
    if (nodetype === 'NodeDocument') {
        icon = `<span data-defids="[&quot;&quot;]" class="b3-list-item__graphic popover__block" data-id="${block.id}">
        📄</span>`;
    } else {
        icon = NodeIcons[nodetype];
        if (icon?.subtypes?.[block?.subtype]) {
            icon = icon.subtypes[block.subtype].icon;
        } else {
            icon = icon.icon;
        }
        icon = `<svg data-defids="[&quot;&quot;]" class="b3-list-item__graphic popover__block" data-id="${block.id}"><use xlink:href="#${icon}"></use></svg>`
    }
    return {
        NodeType: nodetype,
        Icon: icon
    }
}

const templateGroup = (group: IBookmarkGroup) => {
    return `
    <section class="${ClassName.Group}" data-groupid="${group.id}" data-groupname="${group.name}">
        <li class="b3-list-item b3-list-item--hide-action ${ClassName.GroupHeader}" style="--file-toggle-width:20px" data-treetype="bookmark" data-type="undefined" data-subtype="undefined" data-groupid="${group.id}" data-groupname="${group.name}">
            <span style="padding-left: 4px;margin-right: 2px" class="b3-list-item__toggle b3-list-item__toggle--hl" data-id="${group.id}">
                <svg class="b3-list-item__arrow b3-list-item__arrow--open">
                    <use xlink:href="#iconRight"></use>
                </svg>
            </span>
            <svg class="b3-list-item__graphic">
                <use xlink:href="#iconBookmark"></use>
            </svg>
            <span class="b3-list-item__text ariaLabel" data-position="parentE">${group.name}</span>
            <span class="b3-list-item__action">
                <svg>
                    <use xlink:href="#iconMore"></use>
                </svg>
            </span>
            <span class="counter">${group.items ? group.items.length : 0}</span>
        </li>
        <ul class="${ClassName.GroupList}" data-groupid="${group.id}" data-groupname="${group.name}">
        </ul>
    </section>
    `;
}

const templateItem = (item: IBookmarkItem) => {
    let { NodeType, Icon } = buildItemDetail(item);
    return `
    <li class="b3-list-item b3-list-item--hide-action ${ClassName.Item}" style="--file-toggle-width:38px"
        data-node-id="${item.id}" data-ref-text="" data-def-id="" data-type="${NodeType}"
        data-subtype="" data-treetype="bookmark" data-def-path="">
        <span style="padding-left: 22px;margin-right: 2px" class="b3-list-item__toggle fn__hidden">
            <svg data-id="${item.id}" class="b3-list-item__arrow">
                <use xlink:href="#iconRight"></use>
            </svg>
        </span>
        ${Icon}
        <span class="b3-list-item__text ariaLabel" data-position="parentE">
            ${item.title}
        </span>

        <span class="b3-list-item__action">
            <svg>
                <use xlink:href="#iconMore"></use>
            </svg>
        </span>
    </li>
    `;
}

export class Bookmark {
    element: HTMLElement;
    modal: BookmarkDataModal;

    constructor(modal: BookmarkDataModal) {
        this.modal = modal;
    }

    render(container: HTMLElement) {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }

        let fragment = html2ele(template);

        for (let [id, group] of this.modal.bookmarks) {
            if (group.hidden) continue;
            let groupEle = html2ele(templateGroup(group));
            let list = groupEle.querySelector(`.${ClassName.GroupList}`);
            for (let item of group.items) {
                list.appendChild(html2ele(templateItem(item)));
            }
            fragment.querySelector('#custom-bookmark-body').appendChild(groupEle);
        }


        container.appendChild(fragment);
        this.element = container.querySelector('#custom-bookmark-element');
        this.listen();
    }

    private listen() {
        const body = this.element.querySelector('#custom-bookmark-body');

        //dock 顶栏按钮
        this.element.querySelector('.block__icons').addEventListener('click', (e) => {
            let ele = e.target as HTMLElement;
            if (ele.tagName !== 'SPAN') ele = ele.closest('span.block__icon');
            if (!ele) return;
            if (ele.dataset.type === 'add') {
                inputDialog({
                    title: '添加书签组',
                    placeholder: '请输入书签组名称',
                    confirm: (title: string) => {
                        let group = this.modal.newGroup(title);
                        let groupSection = html2ele(templateGroup(group));
                        body.appendChild(groupSection);
                    }
                });
                return;
            }
            //refresh
            if (ele.dataset.type === 'refresh') {
                console.log('refresh');
                return;
            }
            // expand
            if (ele.dataset.type === 'expand') {
                this.element.querySelectorAll(`li.${ClassName.GroupHeader}`).forEach((ele: HTMLElement) => {
                    this.toggleBookmarkGroup(ele, 'open');
                });
                return;
            }
            // collapse
            if (ele.dataset.type === 'collapse') {
                this.element.querySelectorAll(`li.${ClassName.GroupHeader}`).forEach((ele: HTMLElement) => {
                    this.toggleBookmarkGroup(ele, 'close');
                });
                return;
            }
        });

        body.addEventListener('click', (e: MouseEvent) => {
            let target = e.target as HTMLElement;

            //点击书签分组 header
            if (target.closest(`li.${ClassName.GroupHeader}`)) {
                e.stopPropagation();
                const li = target.closest(`li.${ClassName.GroupHeader}`) as HTMLElement;
                //点击菜单按钮
                if (target.closest('span.b3-list-item__action')) {
                    let gid = li.dataset.groupid as TBookmarkGroupId;
                    let menu = this.showGroupContextMenu(gid);
                    menu.open({
                        x: e.clientX,
                        y: e.clientY,
                        isLeft: true
                    });
                    return;
                }
                //点击展开/折叠按钮
                this.toggleBookmarkGroup(li);
            }

            //点击书签
            if (target.closest(`li.${ClassName.Item}`)) {
                e.stopPropagation();
                const li = target.closest(`li.${ClassName.Item}`) as HTMLElement;
                //菜单
                if (target.closest('span.b3-list-item__action')) {
                    let gid = li.closest('section').dataset.groupid as TBookmarkGroupId;
                    let id = li.dataset.nodeId as BlockId;
                    let menu = this.showItemContextMenu(gid, id);
                    menu.open({
                        x: e.clientX,
                        y: e.clientY,
                        isLeft: true
                    });
                    return;
                }
            }

        });

        body.addEventListener('contextmenu', (e: MouseEvent) => {
            let target = e.target as HTMLElement;

            if (target.closest(`li.${ClassName.GroupHeader}`)) {
                let ele = target.closest(`li.${ClassName.GroupHeader}`) as HTMLElement;
                let gid = ele.dataset.groupid as TBookmarkGroupId;
                let menu = this.showGroupContextMenu(gid);
                menu.open({
                    x: e.clientX,
                    y: e.clientY,
                    isLeft: true
                });
                return;
            }

            if (target.closest(`li.${ClassName.Item}`)) {
                let ele = target.closest(`li.${ClassName.Item}`) as HTMLElement;
                let gid = ele.closest('section').dataset.groupid as TBookmarkGroupId;
                let id = ele.dataset.nodeId as BlockId;
                let menu = this.showItemContextMenu(gid, id);
                menu.open({
                    x: e.clientX,
                    y: e.clientY,
                    isLeft: true
                });
                return;
            }
        });

        let dragoverEle: HTMLElement;
        // //droppable
        this.element.addEventListener('dragover', (event: DragEvent) => {
            const type = event.dataTransfer.types[0];
            if (!type.startsWith(Constants.SIYUAN_DROP_GUTTER)) return;

            event.preventDefault();
            event.dataTransfer.dropEffect = "none";

            const target = event.target as HTMLElement;
            let section = target.closest('section.custom-bookmark-group') as HTMLElement;
            if (section) {
                event.dataTransfer.dropEffect = "copy";
                //高亮被悬浮的 group
                if (dragoverEle !== section) {
                    dragoverEle?.classList.toggle('dragover', false);
                    dragoverEle = section;
                    dragoverEle.classList.toggle('dragover', true);
                }
            }
        });
        this.element.addEventListener('drop', (event: DragEvent) => {
            const type = event.dataTransfer.types[0];
            if (!type.startsWith(Constants.SIYUAN_DROP_GUTTER)) return;
            if (!dragoverEle) return;

            event.preventDefault();

            let meta = type.replace(Constants.SIYUAN_DROP_GUTTER, '');
            let info = meta.split(Constants.ZWSP);
            // let nodetype = info[0];
            // let subtype = info[1];
            let nodeId = info[2];
            let gid = dragoverEle.dataset.groupid as TBookmarkGroupId;
            dragoverEle?.classList.toggle('dragover', false);
            dragoverEle = null;
            this.addItem_(gid, nodeId);
        });
    }

    private toggleBookmarkGroup(li: HTMLElement, status?: 'open' | 'close') {
        const ul = li.nextElementSibling as HTMLElement;
        const span = li.querySelector(`.b3-list-item__toggle`);
        let force = status === undefined ? undefined : status === 'open' ? false : true;
        ul.classList.toggle('fn__none', force);
        force = status === undefined ? undefined : status === 'open' ? true : false;
        span.children[0].classList.toggle('b3-list-item__arrow--open', force);
    }

    private showGroupContextMenu(gid: TBookmarkGroupId) {
        let menu = new Menu();
        let group = this.modal.bookmarks.get(gid);
        menu.addItem({
            label: '重命名',
            icon: 'iconEdit',
            click: async () => {
                let title = await inputDialogSync({
                    title: '重命名书签组',
                    defaultText: group.name,
                    width: '20em'
                });
                if (title) {
                    group.name = title.trim();
                    this.element.querySelector(`section.${ClassName.Group}[data-groupid="${gid}"] .b3-list-item__text`).textContent = title;
                }
            }
        });
        return menu;
    };

    private showItemContextMenu(gid: TBookmarkGroupId, id: BlockId) {
        let menu = new Menu();
        menu.addItem({
            label: '删除',
            icon: 'iconTrashcan',
            click: () => {
                this.modal.delItem(gid, id);
            }
        });
        return menu;
    };

    private updateBookmarkGroupCount(gid: TBookmarkGroupId) {
        let group = this.modal.bookmarks.get(gid);
        let groupEle = this.element.querySelector(`.${ClassName.GroupHeader}[data-groupid="${gid}"]`);
        groupEle.querySelector('.counter').textContent = group.items.length.toString();
    }

    // -------------------- Engaged with modal

    private async addItem_(gid: TBookmarkGroupId, id: BlockId) {
        let block = await getBlockByID(id);
        if (!block) return;
        let item: IBookmarkItem = {
            id: block.id,
            title: block.fcontent || block.content,
            type: block.type,
            subtype: block.subtype
        };
        this.modal.addItem(gid, item);
        let groupList = this.element.querySelector(`.${ClassName.GroupList}[data-groupid="${gid}"]`);
        groupList.appendChild(html2ele(templateItem(item)));
        this.updateBookmarkGroupCount(gid);
    }

}
