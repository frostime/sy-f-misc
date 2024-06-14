import { createContext, createSignal, type Accessor } from "solid-js";
import { type Plugin } from "siyuan";
import { type BookmarkDataModel } from "../model";

interface IBookmarkContext {
    plugin: Plugin;
    model: BookmarkDataModel;
    shownGroups: Accessor<IBookmarkGroup[]>
    doAction: Accessor<string>
}

export const BookmarkContext = createContext<IBookmarkContext>();

export const [groupDrop, setGroupDrop] = createSignal<TBookmarkGroupId>("");
export const [itemMoving, setItemMoving] = createSignal<IMoveItemDetail>({
    srcGroup: "",
    targetGroup: "",
    srcItem: "",
    afterItem: ""
});
