import { writable, type Writable } from 'svelte/store';

export const highlightedGroup = writable("");

export const moveItemDetail: Writable<IMoveItemDetail> = writable({
    srcGroup: "",
    targetGroup: "",
    srcItem: "",
    afterItem: ""
});
