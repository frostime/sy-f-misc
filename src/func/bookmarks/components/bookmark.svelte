<script lang="ts">
    import { onMount, setContext } from "svelte";

    import Group from "./group.svelte";
    import { confirm, Plugin } from "siyuan";
    import { BookmarkDataModel } from "../model";
    import { inputDialog } from "@/components/dialog";
    // import { getBlockByID } from "@/api";

    export let plugin: Plugin;
    export let model: BookmarkDataModel;

    setContext('plugin', plugin);

    let groups: IBookmarkGroup[] = [];

    let groupComponent: Group[] = [];

    onMount(() => {
        updateShownGroups();
    });

    function updateShownGroups() {
        groups = model.listGroups();
    }

    function blockIconAdd() {
        inputDialog({
            title: "添加书签组",
            placeholder: "请输入书签组名称",
            confirm: (title: string) => {
                let group = model.newGroup(title);
                groups = [...groups, group];
            },
        });
    }

    function blockIconRefresh() {
        console.log("refresh");
        // Implement refresh logic
    }

    const groupDelete = (e: CustomEvent<IBookmarkGroup>) => {
        const detail = e.detail;
        confirm(
            `是否删除书签组${detail.name}[${detail.id}]?`,
            "⚠️ 删除后无法恢复！确定删除吗？",
            () => {
                if (model.delGroup(detail.id)) {
                    updateShownGroups();
                }
            },
        );
    };
</script>

<div
    class="fn__flex-1 fn__flex-column file-tree custom-bookmark-element"
>
    <div class="block__icons">
        <div class="block__logo">
            <svg class="block__logoicon">
                <use xlink:href="#iconBookmark"></use>
            </svg>
            书签
        </div>
        <span class="fn__flex-1"></span>
        <span class="fn__space"></span>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
            data-type="add"
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label="添加书签组"
            on:click={blockIconAdd}
        >
            <svg class="">
                <use xlink:href="#iconAdd"></use>
            </svg>
        </span>
        <span class="fn__space"></span>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
            data-type="refresh"
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label="刷新"
            on:click={blockIconRefresh}
        >
            <svg class="">
                <use xlink:href="#iconRefresh"></use>
            </svg>
        </span>
        <span class="fn__space"></span>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
            data-type="expand"
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label="展开 Ctrl+↓"
            on:click={() => {
                groupComponent.forEach((group) => group.toggleOpen(true));
            }}
        >
            <svg>
                <use xlink:href="#iconExpand"></use>
            </svg>
        </span>
        <span class="fn__space"></span>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
            data-type="collapse"
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label="折叠 Ctrl+↑"
            on:click={() => {
                groupComponent.forEach((group) => group.toggleOpen(false));
            }}
        >
            <svg>
                <use xlink:href="#iconContract"></use>
            </svg>
        </span>
        <span class="fn__space"></span>
        <span
            data-type="min"
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label="最小化 Ctrl+W"
        >
            <svg>
                <use xlink:href="#iconMin"></use>
            </svg>
        </span>
    </div>
    <div class="fn__flex-1" style="margin-bottom: 8px">
        <ul class="b3-list b3-list--background" id="custom-bookmark-body">
            {#each groups as group, i (group.id)}
                <Group
                    {group}
                    model={model}
                    bind:this={groupComponent[i]}
                    on:deleteGroup={groupDelete}
                />
            {/each}
        </ul>
    </div>
</div>
