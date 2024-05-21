<script lang="ts">
    import { Menu } from "siyuan";
    import Item from "./item.svelte";

    import { inputDialogSync } from "@/components/dialog";
    import BookmarkDataModal from "../modal";

    export let group: IBookmarkGroup;
    export let modal: BookmarkDataModal;

    let isOpen = false;
    export const toggleOpen = (open?: boolean) => {
        isOpen = open ?? !isOpen;
    }

    // Example function to handle context menu
    function showGroupContextMenu(e: MouseEvent) {
        // e.stopPropagation();
        let menu = new Menu();
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
                    modal.renameGroup(group.id, group.name);
                }
            }
        });
        menu.open({
            x: e.clientX,
            y: e.clientY
        });
    }

    let svgArrowClass = "b3-list-item__arrow--open";
    let itemsClass = "";
    $: {
        svgArrowClass = isOpen ? "b3-list-item__arrow--open" : "";
        itemsClass = isOpen ? "" : "fn__none";
    }

</script>

<section
    class="custom-bookmark-group"
    data-groupid={group.id}
    data-groupname={group.name}
>
    <li
        class="b3-list-item b3-list-item--hide-action custom-bookmark-group-header"
        style="--file-toggle-width:20px"
        data-treetype="bookmark"
        data-type="undefined"
        data-subtype="undefined"
        data-groupid={group.id}
        data-groupname={group.name}
        on:contextmenu={showGroupContextMenu}
    >
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
            style="padding-left: 4px; margin-right: 2px"
            class="b3-list-item__toggle b3-list-item__toggle--hl"
            on:click={() => toggleOpen()}
        >
            <svg class="b3-list-item__arrow {svgArrowClass}">
                <use xlink:href="#iconRight"></use>
            </svg>
        </span>
        <svg class="b3-list-item__graphic">
            <use xlink:href="#iconBookmark"></use>
        </svg>
        <span
            class="b3-list-item__text ariaLabel"
            data-position="parentE"
        >
            {group.name}
        </span>
        <span class="b3-list-item__action">
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
            <Item {item} {modal} />
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
