<!--
 Copyright (c) 2024 by frostime. All Rights Reserved.
 Author       : frostime
 Date         : 2024-06-07 19:17:55
 FilePath     : /src/settings/index.svelte
 LastEditTime : 2024-06-07 20:24:21
 Description  : 设置面板的组件
-->

<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SettingPanel from "@/libs/setting-panel.svelte";

    export let GroupEnabled: ISettingItem[];
    export let GroupDocky: ISettingItem[];
    export let GroupMisc: ISettingItem[];
    const groups = [
        {key: 'Enable', text: '✅ 启用功能'},
        {key: 'Docky', text: '⛩️ 侧边栏显示'},
        {key: 'Misc', text: '🔧 其他设置'}
    ];
    let focusGroupKey = groups[0].key;

    /********** Events **********/
    interface IChangeEvent {
        group: string;
        key: string;
        value: any;
    }
    const dispatch = createEventDispatcher();
    const onChanged = ({ detail }: CustomEvent<IChangeEvent>) => {
        dispatch('changed', detail);
    };

</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <li
                data-name="editor"
                class:b3-list-item--focus={group.key === focusGroupKey}
                class="b3-list-item"
                on:click={() => {
                    focusGroupKey = group.key;
                }}
                on:keydown={() => {}}
            >
                <span class="b3-list-item__text">{group.text}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        <SettingPanel
            group={groups[0].key}
            settingItems={GroupEnabled}
            display={focusGroupKey === groups[0].key}
            on:changed={onChanged}
        />
        <SettingPanel
            group={groups[1].key}
            settingItems={GroupDocky}
            display={focusGroupKey === groups[1].key}
            on:changed={onChanged}
        />
        <SettingPanel
            group={groups[2].key}
            settingItems={GroupMisc}
            display={focusGroupKey === groups[2].key}
            on:changed={onChanged}
        >
        </SettingPanel>
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 100%;
    }
    .config__panel > ul > li {
        padding-left: 1rem;
    }
</style>