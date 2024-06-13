import { Component, createEffect, createSignal } from "solid-js";
// import { render } from "solid-js/web";
import Group from "./group";
import { confirm, Menu, Plugin, showMessage } from "siyuan";
import { BookmarkDataModel } from "../model";
import { inputDialog } from "@/libs/dialog";

import { BookmarkContext } from "./context";

import "./index.scss";

interface Props {
    plugin: Plugin;
    model: BookmarkDataModel;
}

const BookmarkComponent: Component<Props> = (props) => {
    const [groups, setGroups] = createSignal<IBookmarkGroup[]>([]);
    const [groupComponent, setGroupComponent] = createSignal<Group[]>([]);
    const [fnRotate, setFnRotate] = createSignal("");

    const updateShownGroups = () => {
        setGroups(props.model.listGroups());
    };

    const blockIconAdd = () => {
        inputDialog({
            title: "添加书签组",
            placeholder: "请输入书签组名称",
            confirm: (title: string) => {
                const group = props.model.newGroup(title);
                setGroups([...groups(), group]);
            },
        });
    };

    const blockIconRefresh = () => {
        setFnRotate("fn__rotate");
        props.model.updateItems().then(() => {
            setTimeout(() => {
                setFnRotate("");
            }, 500);
        });
    };

    const groupDelete = (detail: IBookmarkGroup) => {
        confirm(
            `是否删除书签组${detail.name}[${detail.id}]?`,
            "⚠️ 删除后无法恢复！确定删除吗？",
            () => {
                if (props.model.delGroup(detail.id)) {
                    updateShownGroups();
                }
            }
        );
    };

    const groupMove = (
        detail: {
            to: "up" | "down" | "top" | "bottom";
            group: IBookmarkGroup;
        }
    ) => {
        const srcIdx = groups().findIndex(
            (g: IBookmarkGroup) => g.id === detail.group.id
        );
        let targetIdx;
        if (detail.to === "up") targetIdx = srcIdx - 1;
        else if (detail.to === "down") targetIdx = srcIdx + 1;
        else if (detail.to === "top") targetIdx = 0;
        else if (detail.to === "bottom") targetIdx = groups().length - 1;
        else return;
        if (targetIdx < 0 || targetIdx >= groups().length) return;
        const targetGroup: IBookmarkGroup = groups()[targetIdx];
        props.model.groupSwapOrder(detail.group.id, targetGroup.id);
        setGroups(props.model.listGroups());
    };

    const bookmarkContextMenu = (e: MouseEvent) => {
        const menu = new Menu();
        menu.addItem({
            label: "缓存当前书签",
            icon: "iconDownload",
            click: () => {
                const time = new Date();
                const timeStr = `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()} ${time.getHours()}_${time.getMinutes()}_${time.getSeconds()}`;
                const name = `Cache/bookmarks-${timeStr}.json`;
                props.model.save(name).then(() => {
                    showMessage(`缓存成功: ${name}`);
                });
            },
        });
        menu.open({
            x: e.clientX,
            y: e.clientY,
        });
    };

    createEffect(() => {
        updateShownGroups();
    });

    const Bookmark = () => (
        <div
            class="fn__flex-1 fn__flex-column file-tree sy__bookmark custom-bookmark-element"
            onContextMenu={bookmarkContextMenu}
        >
            <div class="block__icons">
                <div class="block__logo">
                    <svg class="block__logoicon">
                        <use href="#iconBookmark"></use>
                    </svg>
                    书签
                </div>
                <span class="fn__flex-1"></span>
                <span class="fn__space"></span>
                <span
                    data-type="add"
                    class="block__icon b3-tooltips b3-tooltips__sw"
                    aria-label="添加书签组"
                    onClick={blockIconAdd}
                >
                    <svg class="">
                        <use href="#iconAdd"></use>
                    </svg>
                </span>
                <span class="fn__space"></span>
                <span
                    data-type="refresh"
                    class="block__icon b3-tooltips b3-tooltips__sw"
                    aria-label="刷新"
                    onClick={blockIconRefresh}
                >
                    <svg class={fnRotate()}>
                        <use href="#iconRefresh"></use>
                    </svg>
                </span>
                <span class="fn__space"></span>
                <span
                    data-type="expand"
                    class="block__icon b3-tooltips b3-tooltips__sw"
                    aria-label="展开 Ctrl+↓"
                    onClick={() => {
                        groupComponent().forEach((group) => group.toggleOpen(true));
                        props.model.save();
                    }}
                >
                    <svg>
                        <use href="#iconExpand"></use>
                    </svg>
                </span>
                <span class="fn__space"></span>
                <span
                    data-type="collapse"
                    class="block__icon b3-tooltips b3-tooltips__sw"
                    aria-label="折叠 Ctrl+↑"
                    onClick={() => {
                        groupComponent().forEach((group) => group.toggleOpen(false));
                        props.model.save();
                    }}
                >
                    <svg>
                        <use href="#iconContract"></use>
                    </svg>
                </span>
                <span class="fn__space"></span>
                <span
                    data-type="min"
                    class="block__icon b3-tooltips b3-tooltips__sw"
                    aria-label="最小化 Ctrl+W"
                >
                    <svg>
                        <use href="#iconMin"></use>
                    </svg>
                </span>
            </div>
            <div class="fn__flex-1" style="margin-bottom: 8px">
                <ul class="b3-list b3-list--background" id="custom-bookmark-body">
                    {groups().map((group, i) => (
                        <Group
                            group={group}
                            ref={(el) => (groupComponent()[i] = el)}
                            groupDelete={groupDelete}
                            groupMove={groupMove}
                        />
                    ))}
                </ul>
            </div>
        </div>
    );

    return (<BookmarkContext.Provider value={[props.plugin, props.model]}>
        <Bookmark />
    </BookmarkContext.Provider>);
};

export default BookmarkComponent;
