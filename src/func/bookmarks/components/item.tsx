import { Component, createEffect, createMemo, createSignal, useContext } from "solid-js";
import { Menu, openTab, showMessage } from "siyuan";
import { buildItemDetail } from "../libs/dom";

import { itemInfo } from "../model";

import { BookmarkContext, itemMoving, setItemMoving } from "./context";

interface IProps {
    group: TBookmarkGroupId;
    orderedItem: IItemCore;
    deleteItem: (i: IBookmarkItem) => void;
}

const Item: Component<IProps> = (props) => {
    const item = () => itemInfo[props.orderedItem.id];

    const [NodeType, setNodeType] = createSignal<string>("");
    const [Icon, setIcon] = createSignal<string>("");
    const [opacityStyle, setOpacityStyle] = createSignal<string>("");
    const [titleStyle, setTitleStyle] = createSignal<string>("");

    const dragovered = createMemo(() => {
        let value = itemMoving();
        if (value.targetGroup === props.group && value.afterItem === props.orderedItem.id) {
            return 'dragovered';
        } else {
            return '';
        }
    });

    createEffect(() => {
        let value = item();
        if (value) {
            const e = buildItemDetail(value);
            setNodeType(e.NodeType);
            setIcon(e.Icon);
            if (value.err === 'BoxClosed') {
                setTitleStyle('color: var(--b3-theme-on-surface-light);');
            } else if (value.err === 'BlockDeleted') {
                setTitleStyle('color: var(--b3-theme-error);');
            } else {
                setTitleStyle('');
            }
        }
    });

    const {plugin, model, shownGroups} = useContext(BookmarkContext);

    const showItemContextMenu = (e: MouseEvent) => {
        e.stopPropagation();
        const menu = new Menu();
        menu.addItem({
            label: "复制为引用",
            icon: "iconRef",
            click: () => {
                navigator.clipboard
                    .writeText(`((${item().id} '${item().title.replaceAll('\n', '')}'))`)
                    .then(() => {
                        showMessage("复制成功");
                    });
            },
        });
        menu.addItem({
            label: "复制为链接",
            icon: "iconSiYuan",
            click: () => {
                navigator.clipboard
                    .writeText(`[${item().title.replaceAll('\n', '')}](siyuan://blocks/${item().id})`)
                    .then(() => {
                        showMessage("复制成功");
                    });
            },
        });
        menu.addSeparator();
        const groups = shownGroups().filter((g) => g.id !== props.group).map((g) => {
            return {
                label: g.name,
                click: () => {
                    model.transferItem(props.group, g.id, item());
                },
            };
        });
        menu.addItem({
            label: "移动到其他分组",
            icon: "iconFolder",
            type: 'submenu',
            submenu: groups
        });
        menu.addItem({
            label: '移动',
            icon: 'iconMove',
            type: 'submenu',
            submenu: [
                {
                    label: "置顶",
                    icon: "iconTop",
                    click: () => {
                        model.reorderItem(props.group, item(), 'top');
                    }
                },
                {
                    label: "置底",
                    icon: "iconTop",
                    iconClass: "rotate-180",
                    click: () => {
                        model.reorderItem(props.group, item(), 'bottom');
                    }
                }
            ]
        });
        menu.addItem({
            label: "删除书签",
            icon: "iconTrashcan",
            click: () => {
                props.deleteItem(item());
            },
        });
        menu.open({
            x: e.clientX,
            y: e.clientY,
        });
    };

    const openBlock = () => {
        openTab({
            app: plugin.app,
            doc: {
                id: item().id,
                zoomIn: true,
            },
        });
    };

    const onDragStart = (event: DragEvent) => {
        event.dataTransfer.setData("bookmark/item", JSON.stringify({ group: props.group, id: item().id }));
        event.dataTransfer.effectAllowed = "move";
        setOpacityStyle('opacity: 0.5;');
        setItemMoving({
            srcGroup: props.group,
            srcItem: item().id,
            targetGroup: '',
            afterItem: ''
        });
    };

    const onDragEnd = (event: DragEvent) => {
        event.dataTransfer.clearData();
        setOpacityStyle('');
    };

    return (
        <li
            class={`b3-list-item b3-list-item--hide-action custom-bookmark-item ${dragovered()}`}
            // style={`--file-toggle-width:38px; ${opacityStyle()}`}
            style={`${opacityStyle()}`}
            draggable="true"
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            data-node-id={item().id}
            data-ref-text=""
            data-def-id=""
            data-type={NodeType()}
            data-subtype=""
            data-treetype="bookmark"
            data-def-path=""
            data-item-order={props.orderedItem.order}
            onContextMenu={showItemContextMenu}
            onClick={openBlock}
        >
            <span
                style="padding-left: 22px;margin-right: 2px"
                class="b3-list-item__toggle fn__hidden"
            >
                <svg data-id={item().id} class="b3-list-item__arrow">
                    <use href="#iconRight"></use>
                </svg>
            </span>
            <div innerHTML={Icon()}/>
            <span class="b3-list-item__text ariaLabel" data-position="parentE" style={titleStyle()}>
                {item().title}
            </span>
            <span
                class="b3-list-item__action"
                role="button"
                tabindex="0"
                onClick={(e) => {
                    e.stopPropagation();
                    showItemContextMenu(e);
                }}
            >
                <svg>
                    <use href="#iconMore"></use>
                </svg>
            </span>
            <span class="fn__space" />
        </li>
    );
};

export default Item;
