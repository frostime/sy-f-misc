<!--
 Copyright (c) 2024 by frostime. All Rights Reserved.
 Author       : frostime
 Date         : 2024-05-25 18:50:36
 FilePath     : /src/func/bookmarks/components/setting/index.svelte
 LastEditTime : 2024-06-07 19:09:41
 Description  : 
-->
<script lang="ts">
    import { setContext } from "svelte";
    import { type BookmarkDataModel } from "../../model";
    import SettingItemWrap from "@/libs/setting-item-wrap.svelte";
    import GroupList from "./group-list.svelte";
    export let model: BookmarkDataModel;

    setContext('model', model);
</script>

<div class="config__tab-container fn__flex-1">
    <SettingItemWrap
        title="书签组"
        description="设置书签组"
        direction="row"
    >
        <GroupList />
    </SettingItemWrap>
</div>

<style lang="scss">
    .config__tab-container {
        font-size: 1.2rem;
        padding: 10px 20px;
    }
</style>
