import { createContext, createSignal } from "solid-js";
import { type Plugin } from "siyuan";
import { type BookmarkDataModel } from "../model";

export const BookmarkContext = createContext<[Plugin, BookmarkDataModel]>();

export const [groupDrop, setGroupDrop] = createSignal<TBookmarkGroupId>("");
export const [itemMoving, setItemMoving] = createSignal<IMoveItemDetail>({
    srcGroup: "",
    targetGroup: "",
    srcItem: "",
    afterItem: ""
});
