<script lang="ts">
    import { getContext } from "svelte";
    import { type BookmarkDataModel } from "../../model";
    let model: BookmarkDataModel = getContext("model");
    let groups = model.listGroups();

    const onDragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const onDrop = (e) => {
        e.preventDefault();
        let data = e.dataTransfer.getData("text/plain");
        e.dataTransfer.clearData();
        let target = e.target.closest(".bookmark-group") as HTMLElement;
        let index = target.dataset.index;
        let temp = groups[index];
        groups[index] = groups[data];
        groups[data] = temp;
    };

</script>

<section class="fn__flex fn__flex-1 fn__flex-column">
    {#each groups as group, i (group.id)}
        <li
            class="bookmark-group ariaLabel b3-list-item"
            style="gap: 10px;"
            aria-label="{group.id}"
            data-index={i}
            data-group-id={group.id}
            draggable="true"
            on:dragstart={(e) => {
                e.dataTransfer.setData("text/plain", `${i}`);
            }}
            on:dragover={onDragover}
            on:drop={onDrop}
        >
            <svg class="b3-list-item__graphic">
                <use xlink:href="#iconFolder"></use>
            </svg>
            <span class="b3-list-item__text ariaLabel" data-position="parentE">
                {group.name}
            </span>
            <span class="fn__space" />
            <div class="fn__flex fn__flex-center">
                <input
                    class="b3-switch fn__flex-center"
                    checked={group.hidden === true? false: true}
                    type="checkbox"
                    on:change={() => {
                        group.hidden = !group.hidden;
                    }}
                />
            </div>
        </li>
    {/each}
</section>

<style>
    section {
        border: 2px solid var(--b3-theme-primary-lighter);
        border-radius: 5px;
        padding: 15px 10px;
        gap: 10px;
    }
    li.bookmark-group {
        padding: 5px 10px;
        box-shadow: 0 0 5px 3px rgba(0, 0, 0, 0.1);
    }
</style>
