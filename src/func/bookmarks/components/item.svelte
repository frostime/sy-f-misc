<script lang="ts">
    import { getContext, createEventDispatcher } from "svelte";
    import { Menu, openTab, Plugin, showMessage } from "siyuan";
    import { ClassName, buildItemDetail } from "../utils";
    import { ItemInfoStore, type BookmarkDataModel } from "../model";
    import { type Writable } from "svelte/store";

    import { highlightedItem } from "./store";


    export let group: TBookmarkGroupId;
    export let block: BlockId;
    let item: Writable<IBookmarkItemInfo> = ItemInfoStore?.[block];

    const dispatch = createEventDispatcher();
    let plugin: Plugin = getContext("plugin");
    let model: BookmarkDataModel = getContext("model");
    let titleStyle = '';

    // let { NodeType, Icon } = buildItemDetail($item);
    let { NodeType, Icon } = { NodeType: "", Icon: "" };

    item.subscribe((value) => {
        if (value) {
            ({ NodeType, Icon } = buildItemDetail(value));
            if (value.err === 'BoxClosed') {
                titleStyle = 'color: var(--b3-theme-on-surface-light);'
            } else if (value.err === 'BlockDeleted') {
                titleStyle = 'color: var(--b3-theme-error);'
            } else {
                titleStyle = ''
            }
        }
    })

    const showItemContextMenu = (e: MouseEvent) => {
        e.stopPropagation();
        let menu = new Menu();
        menu.addItem({
            label: "复制为引用",
            icon: "iconRef",
            click: () => {
                navigator.clipboard
                    .writeText(`((${$item.id} '${$item.title.replaceAll('\n', '')}'))`)
                    .then(() => {
                        showMessage("复制成功");
                    });
            },
        });
        menu.addItem({
            label: "复制为链接",
            icon: "iconSiYuan",
            click: () => {
                navigator.clipboard
                    .writeText(`[${$item.title.replaceAll('\n', '')}](siyuan://blocks/${$item.id})`)
                    .then(() => {
                        showMessage("复制成功");
                    });
            },
        });
        menu.addSeparator();
        let groups = model.listGroups().filter((g) => g.id !== group).map((g) => {
            return {
                label: g.name,
                click: () => {
                    model.transferItem(group, g.id, $item);
                },
            };
        });
        menu.addItem({
            label: "移动到其他分组",
            icon: "iconFolder",
            type: 'submenu',
            submenu: Array.from(groups)
        });
        menu.addItem({
            label: "移动到最上方",
            icon: "iconUp",
            click: () => {
                model.reorderItem(group, $item, 'up');
            }
        });
        menu.addItem({
            label: "移动到最下方",
            icon: "iconDown",
            click:  () => {
                model.reorderItem(group, $item, 'down');
            }
        });
        menu.addItem({
            label: "删除书签",
            icon: "iconTrashcan",
            click: () => {
                dispatch("deleteItem", $item);
            },
        });
        menu.open({
            x: e.clientX,
            y: e.clientY,
        });
    };

    const openBlock = () => {
        openTab({
            app: plugin.app,
            doc: {
                id: $item.id,
                zoomIn: true,
            },
        });
    };

    let opacityStyle = '';

    const onDragStart = (event: DragEvent) => {
        event.dataTransfer.setData("bookmark/item", JSON.stringify({group: group, id: $item.id}));
        event.dataTransfer.effectAllowed = "move";
        opacityStyle = 'opacity: 0.5;';
    };

    const onDragEnd = (event: DragEvent) => {
        event.dataTransfer.clearData();
        opacityStyle = '';
    };

    let dragovered = '';
    highlightedItem.subscribe((value) => {
        if (value.targetGroup === group && value.targetItem === block) {
            dragovered = 'dragovered';
        } else {
            dragovered = '';
        }
    });

</script>

<li
    class="b3-list-item b3-list-item--hide-action {ClassName.Item} {dragovered}"
    style="--file-toggle-width:38px; {opacityStyle}"
    draggable="true"
    on:dragstart={onDragStart}
    on:dragend={onDragEnd}
    data-node-id={$item.id}
    data-ref-text=""
    data-def-id=""
    data-type={NodeType}
    data-subtype=""
    data-treetype="bookmark"
    data-def-path=""
    on:contextmenu={showItemContextMenu}
    on:click={openBlock}
>
    <span
        style="padding-left: 22px;margin-right: 2px"
        class="b3-list-item__toggle fn__hidden"
    >
        <svg data-id={$item.id} class="b3-list-item__arrow">
            <use xlink:href="#iconRight"></use>
        </svg>
    </span>
    {@html Icon}
    <span class="b3-list-item__text ariaLabel" data-position="parentE" style="{titleStyle}">
        {$item.title}
    </span>

    <span
        class="b3-list-item__action"
        role="button"
        tabindex="0"
        on:click={(e) => {
            e.stopPropagation();
            showItemContextMenu(e);
        }}
    >
        <svg>
            <use xlink:href="#iconMore"></use>
        </svg>
    </span>
    <span class="fn__space"/>
</li>

<style>
    li.b3-list-item.dragovered {
        box-sizing: border-box;
        border-bottom: 2px solid var(--b3-theme-primary);
        border-bottom-left-radius: 0px;
        border-bottom-right-radius: 0px;
    }
</style>
