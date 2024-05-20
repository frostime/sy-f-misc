import { Constants } from "siyuan";

import { html2ele } from "@/utils";

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
    return `
    <li class="b3-list-item b3-list-item--hide-action ${ClassName.Item}" style="--file-toggle-width:38px"
        data-node-id="${item.id}" data-ref-text="" data-def-id="" data-type="NodeDocument"
        data-subtype="" data-treetype="bookmark" data-def-path="">
        <span style="padding-left: 22px;margin-right: 2px" class="b3-list-item__toggle fn__hidden">
            <svg data-id="${item.id}" class="b3-list-item__arrow">
                <use xlink:href="#iconRight"></use>
            </svg>
        </span>
        <span data-defids="[&quot;&quot;]" class="b3-list-item__graphic popover__block"
            data-id="${item.id}">
            📄
        </span>
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

type TGroupId = string;

interface IBookmarkItem {
    id: BlockId;
    title: string;
    type: BlockType;
    subtype?: BlockSubType;
}

interface IBookmarkGroup {
    id: TGroupId;
    name: string;
    items?: IBookmarkItem[];
}

export class Bookmark {
    element: HTMLElement;
    bookmarks: Map<TGroupId, IBookmarkGroup>;

    constructor() {
        this.bookmarks = new Map();
    }

    initBookmarks(bookmarks: IBookmarkGroup[]) {
        for (let group of bookmarks) {
            this.bookmarks.set(group.id, group);
        }
    }

    render(container: HTMLElement) {
        let fragment = html2ele(template);

        for (let [id, group] of this.bookmarks) {
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
        //dock 顶栏按钮
        this.element.querySelector('.block__icons').addEventListener('click', (e) => {
            let ele = e.target as HTMLElement;
            if (ele.tagName !== 'SPAN') ele = ele.closest('span.block__icon');
            if (!ele) return;
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

        this.element.querySelectorAll(`.${ClassName.GroupHeader}`).forEach((ele: HTMLElement) => {
            ele.addEventListener('click', (e) => {
                let target = e.target as HTMLElement;
                if (target.classList.contains('b3-list-item__action')) {
                    console.log('action');
                    return;
                }

                this.toggleBookmarkGroup(ele);
            });
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

            event.preventDefault();
            dragoverEle?.classList.toggle('dragover', false);
            dragoverEle = null;

            let meta = type.replace(Constants.SIYUAN_DROP_GUTTER, '');
            let info = meta.split(Constants.ZWSP);
            // let nodetype = info[0];
            // let subtype = info[1];
            // let nodeId = info[2];
            console.log('drop block', info);
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

}
