import { writable, type Writable } from 'svelte/store';

export const highlightedGroup = writable("");

//被 drag over 悬停的 item
interface IDragedOverItem {
    srcItem: BlockId;
    targetItem: BlockId;
    srcGroup: TBookmarkGroupId;
    targetGroup: TBookmarkGroupId;
}
export const highlightedItem: Writable<IDragedOverItem> = writable({
    srcGroup: "",
    targetGroup: "",
    srcItem: "",
    targetItem: ""
});
