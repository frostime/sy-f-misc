<script lang="ts">
    import { getContext, createEventDispatcher } from "svelte";
    import { Menu, Constants, confirm, showMessage } from "siyuan";
    import Item from "./item.svelte";

    import { inputDialogSync } from "@/libs/dialog";
    import { BookmarkDataModel, ItemOrderStore } from "../model";
    import { ClassName } from "../utils";
    import { getBlockByID } from "@/api";

    import { highlightedGroup, moveItemDetail } from "./store";
    import { type Writable } from "svelte/store";

    export let group: IBookmarkGroup;
    let model: BookmarkDataModel = getContext("model");
    let itemsOrder: Writable<IItemOrder[]> = ItemOrderStore?.[group.id];

    const dispatch = createEventDispatcher();

    let isOpen = group.expand !== undefined ? !group.expand : true;
    export const toggleOpen = (open?: boolean) => {
        isOpen = open ?? !isOpen;
        group.expand = !isOpen;
    };

    const addItemByBlockId = async (blockId: string) => {
        if (model.hasItem(blockId, group.id)) {
            showMessage(
                `无法添加: 书签组中已存在 ID 为 [${blockId}] 的块`,
                5000,
                "error",
            );
            return;
        }
        let block = await getBlockByID(blockId);
        if (!block) {
            showMessage(
                `无法添加: 未找到 ID 为 [${blockId}] 的块`,
                5000,
                "error",
            );
            return;
        }
        let item: IBookmarkItem = {
            id: block.id,
            title: block.fcontent || block.content,
            type: block.type,
            subtype: block.subtype,
            box: block.box,
        };
        model.addItem(group.id, item);
        toggleOpen(true);
    };

    // Example function to handle context menu
    function showGroupContextMenu(e: MouseEvent) {
        e.stopPropagation();
        let menu = new Menu();
        menu.addItem({
            label: "复制",
            icon: "iconRef",
            click: () => {
                let items = model.listItems(group.id);
                let refs = items
                    .map(
                        (item) =>
                            `* ((${item.id} '${item.title.replaceAll("\n", "")}'))`,
                    )
                    .join("\n");
                navigator.clipboard.writeText(refs).then(() => {
                    showMessage("复制成功");
                });
            },
        });
        let docFlow = globalThis.siyuan.ws.app.plugins.find(p => p.name == 'sy-docs-flow');
        if (docFlow) {
            menu.addItem({
            label: "文档流",
            icon: "iconFlow",
            click: () => {
                let idlist = group.items.sort((a, b) => a.order - b.order).map(item => item.id);
                docFlow.eventBus.emit('IdList', {
                    input: idlist,
                    config: {}
                });
            },
        });
        }
        menu.addSeparator();
        menu.addItem({
            label: "重命名书签组",
            icon: "iconEdit",
            click: async () => {
                let title = await inputDialogSync({
                    title: "重命名书签组",
                    defaultText: group.name,
                    width: "20em",
                });
                if (title) {
                    model.renameGroup(group.id, title.trim());
                    group.name = group.name;
                }
            },
        });
        menu.addItem({
            label: "删除书签组",
            icon: "iconTrashcan",
            click: async () => {
                dispatch("deleteGroup", group);
            },
        });
        menu.addSeparator();
        menu.addItem({
            label: "置顶",
            icon: "iconTop",
            click: async () => {
                dispatch("move", {to: 'top', group});
            },
        });
        menu.addItem({
            label: "上移",
            icon: "iconUp",
            click: async () => {
                dispatch("move", {to: 'up', group});
            },
        });
        menu.addItem({
            label: "下移",
            icon: "iconDown",
            click: async () => {
                dispatch("move", {to: 'down', group});
            },
        });
        menu.addItem({
            label: "置底",
            icon: "iconTop",
            iconClass: "rotate-180",
            click: async () => {
                dispatch("move", {to: 'bottom', group});
            },
        });
        menu.addSeparator();
        menu.addItem({
            label: "从剪贴板中插入块",
            icon: "iconAdd",
            click: () => {
                const BlockRegex = {
                    id: /^(\d{14}-[0-9a-z]{7})$/, // 块 ID 正则表达式
                    ref: /^\(\((\d{14}-[0-9a-z]{7}) ['"'].+?['"']\)\)$/,
                    url: /^siyuan:\/\/blocks\/(\d{14}-[0-9a-z]{7})/, // 思源 URL Scheme 正则表达式
                };

                navigator.clipboard.readText().then(async (text) => {
                    for (let regex of Object.values(BlockRegex)) {
                        let match = text.match(regex);
                        if (match) {
                            addItemByBlockId(match[1]);
                            return;
                        }
                    }
                    showMessage(`无法从[${text}]中解析到块`, 5000, "error");
                });
            },
        });
        menu.addItem({
            label: "添加当前文档块",
            icon: "iconAdd",
            click: () => {
                let li = document.querySelector(
                    "ul.layout-tab-bar>li.item--focus",
                );
                if (!li) return;
                let dataId = li.getAttribute("data-id");
                let protyle = document.querySelector(
                    `div.protyle[data-id="${dataId}"] .protyle-title`,
                );
                if (!protyle) return;
                let id = protyle.getAttribute("data-node-id");
                addItemByBlockId(id);
            },
        });
        menu.open({
            x: e.clientX,
            y: e.clientY,
        });
    }

    const itemDelete = (e: CustomEvent<IBookmarkItem>) => {
        const detail = e.detail;
        let title = detail.title;
        if (title.length > 20) {
            title = title.slice(0, 20) + "...";
        }
        confirm(
            `是否删除书签项目${title}?`,
            "⚠️ 删除后无法恢复！确定删除吗？",
            () => {
                model.delItem(group.id, detail.id)
            },
        );
    };

    let isDragOver = false;

    const checkDragOveredItem = (e: DragEvent) => {
        let target = e.target as HTMLElement;
        let li = target.closest('li.b3-list-item') as HTMLElement;
        // return li?.getAttribute('data-node-id');
        if (li == null) return null;
        if (li.classList.contains(ClassName.GroupHeader)) {
            // console.log('group header');
            return {type: 'group', id: ""};
        } else if (li.classList.contains(ClassName.Item)) {
            return {type: 'item', id: li.getAttribute('data-node-id')};
        }
        return null;
    }

    const onDragOver = (event: DragEvent) => {
        const type = event.dataTransfer.types[0];
        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            isDragOver = true;
        } else if (type === 'bookmark/item') {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            isDragOver = true;
            let overedItem = checkDragOveredItem(event);
            if (!overedItem) return;
            moveItemDetail.update((value) => {
                value.targetGroup = group.id;
                value.afterItem = overedItem.id;
                return value;
            });
        }
    };

    const onDragLeave = (event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
        isDragOver = false;
    };

    const onDrop = async (event: DragEvent) => {
        const type = event.dataTransfer.types[0];
        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
            let meta = type.replace(Constants.SIYUAN_DROP_GUTTER, "");
            let info = meta.split(Constants.ZWSP);
            let nodeId = info[2];
            addItemByBlockId(nodeId);
        } else if (type === 'bookmark/item') {
            model.moveItem($moveItemDetail);
            moveItemDetail.set({
                srcGroup: "",
                srcItem: "",
                targetGroup: "",
                afterItem: "",
            });
        }
        isDragOver = false;
    };

    let svgArrowClass = "b3-list-item__arrow--open";
    let itemsClass = "";
    $: {
        svgArrowClass = isOpen ? "b3-list-item__arrow--open" : "";
        itemsClass = isOpen ? "" : "fn__none";
    }

    //拖拉 item
    let dragovered = '';
    moveItemDetail.subscribe((value) => {
        if (value.targetGroup === group.id && value.afterItem === '') {
            dragovered = 'dragovered';
        } else {
            dragovered = '';
        }
    });

</script>

<section
    class="custom-bookmark-group {isDragOver ? 'dragover' : ''}"
    data-groupid={group.id}
    data-groupname={group.name}
    on:dragover={onDragOver}
    on:dragleave={onDragLeave}
    on:drop={onDrop}
    role="list"
>
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <li
        class="b3-list-item b3-list-item--hide-action custom-bookmark-group-header  {dragovered} {$highlightedGroup ===
        group.id
            ? 'b3-list-item--focus'
            : ''}"
        style="--file-toggle-width:20px"
        data-treetype="bookmark"
        data-type="undefined"
        data-subtype="undefined"
        data-groupid={group.id}
        data-groupname={group.name}
        on:click={() => {
            highlightedGroup.set(group.id);
            toggleOpen();
            model.save();
        }}
        on:contextmenu={showGroupContextMenu}
    >
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
            style="padding-left: 4px; margin-right: 2px"
            class="b3-list-item__toggle b3-list-item__toggle--hl"
        >
            <svg class="b3-list-item__arrow {svgArrowClass}">
                <use xlink:href="#iconRight"></use>
            </svg>
        </span>
        <svg class="b3-list-item__graphic">
            <use xlink:href="#iconFolder"></use>
        </svg>
        <span class="b3-list-item__text ariaLabel" data-position="parentE">
            {group.name}
        </span>
        <span
            class="b3-list-item__action"
            on:click={(e) => {
                e.stopPropagation();
                showGroupContextMenu(e);
            }}
        >
            <svg>
                <use xlink:href="#iconMore"></use>
            </svg>
        </span>
        <span class="counter">{$itemsOrder.length}</span>
    </li>
    <ul
        class="custom-bookmark-group-list {itemsClass}"
        data-groupid={group.id}
        data-groupname={group.name}
    >
        {#each $itemsOrder.sort((a, b) => a.order - b.order) as item (item.id)}
            <Item group={group.id} block={item.id} on:deleteItem={itemDelete} />
        {/each}
    </ul>
</section>

<style>
    li.b3-list-item {
        box-sizing: border-box;
        border-bottom-width: 2px;
    }
    li.b3-list-item.dragovered {
        border-bottom: 2px solid var(--b3-theme-primary);
        border-bottom-left-radius: 0px;
        border-bottom-right-radius: 0px;
    }
</style>
