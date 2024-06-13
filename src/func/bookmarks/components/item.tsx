import { Component, createEffect, createMemo, createSignal, onCleanup, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Menu, openTab, showMessage } from "siyuan";
import { buildItemDetail } from "../libs/dom";
import { ItemInfoStore } from "../model";
import { moveItemDetail } from "../../../../tmp/store";
import { BookmarkContext } from "./context";

interface IProps {
    group: TBookmarkGroupId;
    block: BlockId;
    deleteItem: (i: IBookmarkItem) => void;
}

const Item: Component<IProps> = (props) => {
    const item = createMemo<IBookmarkItemInfo>(ItemInfoStore?.[props.block]);

    const [NodeType, setNodeType] = createSignal<string>("");
    const [Icon, setIcon] = createSignal<string>("");
    const [titleStyle, setTitleStyle] = createSignal<string>("");
    const [opacityStyle, setOpacityStyle] = createSignal<string>("");
    const [dragovered, setDragovered] = createSignal<string>("");

    const [plugin, model] = useContext(BookmarkContext);

    createEffect(() => {
        let value = item();
        if (value) {
            const { NodeType, Icon } = buildItemDetail(value);
            setNodeType(NodeType);
            setIcon(Icon);
            if (value.err === 'BoxClosed') {
                setTitleStyle('color: var(--b3-theme-on-surface-light);');
            } else if (value.err === 'BlockDeleted') {
                setTitleStyle('color: var(--b3-theme-error);');
            } else {
                setTitleStyle('');
            }
        }
    });

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
        const groups = model.listGroups().filter((g) => g.id !== props.group).map((g) => {
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
            label: "移动到最上方",
            icon: "iconUp",
            click: () => {
                model.reorderItem(props.group, item(), 'up');
            }
        });
        menu.addItem({
            label: "移动到最下方",
            icon: "iconDown",
            click: () => {
                model.reorderItem(props.group, item(), 'down');
            }
        });
        menu.addItem({
            label: "删除书签",
            icon: "iconTrashcan",
            click: () => {
                props.deleteItem(item());
                // dispatchEvent(new CustomEvent('deleteItem', { detail: item() }));
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
        moveItemDetail.set({
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

    createEffect(() => {
        const subscription = moveItemDetail.subscribe((value) => {
            if (value.targetGroup === props.group && value.afterItem === props.block) {
                setDragovered('dragovered');
            } else {
                setDragovered('');
            }
        });
        onCleanup(() => subscription.unsubscribe());
    });

    return (
        <li
            class={`b3-list-item b3-list-item--hide-action custom-bookmark-item ${dragovered()}`}
            style={`--file-toggle-width:38px; ${opacityStyle()}`}
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
            <Dynamic component={Icon()}/>
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
