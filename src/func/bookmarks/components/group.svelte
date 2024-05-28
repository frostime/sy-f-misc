<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { Menu, Constants, confirm, showMessage } from "siyuan";
    import Item from "./item.svelte";

    import { inputDialogSync } from "@/components/dialog";
    import { BookmarkDataModel } from "../model";
    import { getBlockByID } from "@/api";

    import { highlightedGroup } from "./store";

    export let group: IBookmarkGroupV2;
    export let model: BookmarkDataModel;

    const dispatch = createEventDispatcher();

    let isOpen = true;
    export const toggleOpen = (open?: boolean) => {
        isOpen = open ?? !isOpen;
    };

    const addItemByBlockId = async (blockId: string) => {
        let block = await getBlockByID(blockId);
        if (!block) {
            showMessage(`未找到 ID 为 [${blockId}] 的块`, 5000, "error");
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
        group.items = group.items;
        toggleOpen(true);
    };

    // Example function to handle context menu
    function showGroupContextMenu(e: MouseEvent) {
        // e.stopPropagation();
        let menu = new Menu();
        menu.addItem({
            label: "复制",
            icon: "iconRef",
            click: () => {
                let items = model.listItems(group.id);
                let refs = items
                    .map((item) => `* ((${item.id} '${item.title.replaceAll('\n', '')}'))`)
                    .join("\n");
                navigator.clipboard.writeText(refs).then(() => {
                    showMessage("复制成功");
                });
            },
        });
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
                if (model.delItem(group.id, detail.id)) {
                    group.items = group.items;
                }
            },
        );
    };

    let isDragOver = false;

    const onDragOver = (event: DragEvent) => {
        const type = event.dataTransfer.types[0];
        if (!type.startsWith(Constants.SIYUAN_DROP_GUTTER)) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        isDragOver = true;
    };

    const onDragLeave = (event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
        isDragOver = false;
    };

    const onDrop = async (event: DragEvent) => {
        const type = event.dataTransfer.types[0];
        if (!type.startsWith(Constants.SIYUAN_DROP_GUTTER)) return;

        let meta = type.replace(Constants.SIYUAN_DROP_GUTTER, "");
        let info = meta.split(Constants.ZWSP);
        // let nodetype = info[0];
        // let subtype = info[1];
        let nodeId = info[2];
        addItemByBlockId(nodeId);
        isDragOver = false;
    };

    let svgArrowClass = "b3-list-item__arrow--open";
    let itemsClass = "";
    $: {
        svgArrowClass = isOpen ? "b3-list-item__arrow--open" : "";
        itemsClass = isOpen ? "" : "fn__none";
    }
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
        class="b3-list-item b3-list-item--hide-action custom-bookmark-group-header {$highlightedGroup ===
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
            <use xlink:href="#iconBookmark"></use>
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
        <span class="counter">{group.items.length}</span>
    </li>
    <ul
        class="custom-bookmark-group-list {itemsClass}"
        data-groupid={group.id}
        data-groupname={group.name}
    >
        {#each group.items as item}
            <Item block={item.id} on:deleteItem={itemDelete} />
        {/each}
    </ul>
</section>

<!-- <style>
    .custom-bookmark-group-header {
        cursor: pointer;
    }
    .b3-list-item__arrow--open {
        transform: rotate(90deg);
    }
</style> -->
