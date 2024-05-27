<script lang="ts">
    import { getContext, createEventDispatcher } from "svelte";
    import { Menu, openTab, Plugin, showMessage } from "siyuan";
    import { NodeIcons, BlockType2NodeType } from "@/utils/const";
    import { ClassName } from "../utils";
    // import BookmarkDataModal from "../modal";

    export let item: IBookmarkItem;

    const dispatch = createEventDispatcher();

    let plugin: Plugin = getContext("plugin");

    let NodeType = BlockType2NodeType[item.type];
    let Icon = "";

    const buildItemDetail = (block: {
        id: BlockId;
        type: BlockType;
        subtype?: BlockSubType;
    }) => {
        let nodetype = BlockType2NodeType[block.type];
        let icon: any;
        if (nodetype === "NodeDocument") {
            icon = `<span data-defids="[&quot;&quot;]" class="b3-list-item__graphic popover__block" data-id="${block.id}">📄</span>`;
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

    $: {
        ({ NodeType, Icon } = buildItemDetail(item));
    }

    const showItemContextMenu = (e: MouseEvent) => {
        let menu = new Menu();
        menu.addItem({
            label: "复制为引用",
            icon: "iconRef",
            click: () => {
                navigator.clipboard
                    .writeText(`((${item.id} '${item.title}'))`)
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
                    .writeText(`[${item.title}](siyuan://blocks/${item.id})`)
                    .then(() => {
                        showMessage("复制成功");
                    });
            },
        });
        menu.addSeparator();
        menu.addItem({
            label: "删除书签",
            icon: "iconTrashcan",
            click: () => {
                dispatch("deleteItem", item);
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
                id: item.id,
                zoomIn: true,
            },
        });
    };
</script>

<li
    class="b3-list-item b3-list-item--hide-action {ClassName.Item}"
    style="--file-toggle-width:38px"
    data-node-id={item.id}
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
        <svg data-id={item.id} class="b3-list-item__arrow">
            <use xlink:href="#iconRight"></use>
        </svg>
    </span>
    {@html Icon}
    <span class="b3-list-item__text ariaLabel" data-position="parentE">
        {item.title}
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
