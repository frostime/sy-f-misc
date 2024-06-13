import { Component, createMemo, createSignal, useContext } from "solid-js";
import { For } from "solid-js";
import { Menu, Constants, confirm, showMessage } from "siyuan";
import Item from "./item";
import { inputDialogSync } from "@/libs/dialog";
import { itemOrder } from "../model";
import { ClassName } from "../libs/dom";
import { getBlockByID } from "@/api";
// import { highlightedGroup, moveItemDetail } from "../../../../tmp/store";

import { BookmarkContext, itemMoving, setItemMoving, groupDrop, setGroupDrop } from "./context";


interface Props {
    group: IBookmarkGroup;
    groupDelete: (g: IBookmarkGroup) => void;
    groupMove: (e: {to: string, group: IBookmarkGroup}) => void;
}

const Group: Component<Props> = (props) => {
    const [_, model] = useContext(BookmarkContext);

    let orders = () => itemOrder[props.group.id];

    const orderedItems = createMemo(() => {
        console.log('reorder items:', props.group)
        return orders().sort((a, b) => a.order - b.order);
    })

    const [isOpen, setIsOpen] = createSignal(props.group.expand !== undefined ? !props.group.expand : true);

    const [isDragOver, setIsDragOver] = createSignal(false);

    const dragovered = createMemo(() => {
        let value = itemMoving();
        if (value.targetGroup === props.group.id && value.afterItem === '') {
            return 'dragovered';
        } else {
            return '';
        }
    });

    const toggleOpen = (open?: boolean) => {
        setIsOpen(open !== undefined ? open : !isOpen());
        props.group.expand = !isOpen();
    };

    const addItemByBlockId = async (blockId: string) => {
        if (model.hasItem(blockId, props.group.id)) {
            showMessage(
                `无法添加: 书签组中已存在 ID 为 [${blockId}] 的块`,
                5000,
                "error"
            );
            return;
        }
        const block = await getBlockByID(blockId);
        if (!block) {
            showMessage(
                `无法添加: 未找到 ID 为 [${blockId}] 的块`,
                5000,
                "error"
            );
            return;
        }
        const item: IBookmarkItem = {
            id: block.id,
            title: block.fcontent || block.content,
            type: block.type,
            subtype: block.subtype,
            box: block.box,
        };
        model.addItem(props.group.id, item);
        toggleOpen(true);
    };

    const showGroupContextMenu = (e: MouseEvent) => {
        e.stopPropagation();
        const menu = new Menu();
        menu.addItem({
            label: "复制",
            icon: "iconRef",
            click: () => {
                const items = model.listItems(props.group.id);
                const refs = items
                    .map(
                        (item) =>
                            `* ((${item.id} '${item.title.replaceAll("\n", "")}'))`
                    )
                    .join("\n");
                navigator.clipboard.writeText(refs).then(() => {
                    showMessage("复制成功");
                });
            },
        });

        const docFlow = (globalThis as any).siyuan.ws.app.plugins.find(p => p.name === 'sy-docs-flow');
        if (docFlow) {
            menu.addItem({
                label: "文档流",
                icon: "iconFlow",
                click: () => {
                    const idlist = props.group.items.sort((a, b) => a.order - b.order).map(item => item.id);
                    docFlow.eventBus.emit('IdList', {
                        input: idlist,
                        config: {}
                    });
                },
            });
        }
        menu.addSeparator();
        menu.addItem({
            label: "重命名书签组",
            icon: "iconEdit",
            click: async () => {
                const title = await inputDialogSync({
                    title: "重命名书签组",
                    defaultText: props.group.name,
                    width: "20em",
                });
                if (title) {
                    model.renameGroup(props.group.id, title.trim());
                    props.group.name = props.group.name;
                }
            },
        });
        menu.addItem({
            label: "删除书签组",
            icon: "iconTrashcan",
            click: async () => {
                props.groupDelete(props.group);
            },
        });
        menu.addSeparator();
        menu.addItem({
            label: "置顶",
            icon: "iconTop",
            click: async () => {
                props.groupMove({ to: 'top', group: props.group } );
            },
        });
        menu.addItem({
            label: "上移",
            icon: "iconUp",
            click: async () => {
                // dispatchEvent(new CustomEvent('move', { detail: { to: 'up', group: props.group } }));
                props.groupMove({ to: 'up', group: props.group } );
            },
        });
        menu.addItem({
            label: "下移",
            icon: "iconDown",
            click: async () => {
                // dispatchEvent(new CustomEvent('move', { detail: { to: 'down', group: props.group } }));
                props.groupMove({ to: 'bottom', group: props.group } );
            },
        });
        menu.addItem({
            label: "置底",
            icon: "iconTop",
            iconClass: "rotate-180",
            click: async () => {
                // dispatchEvent(new CustomEvent('move', { detail: { to: 'bottom', group: props.group } }));
                props.groupMove({ to: 'bottom', group: props.group } );
            },
        });
        menu.addSeparator();
        menu.addItem({
            label: "从剪贴板中插入块",
            icon: "iconAdd",
            click: () => {
                const BlockRegex = {
                    id: /^(\d{14}-[0-9a-z]{7})$/, // 块 ID 正则表达式
                    ref: /^\(\((\d{14}-[0-9a-z]{7}) ['"'].+?['"']\)\)$/,
                    url: /^siyuan:\/\/blocks\/(\d{14}-[0-9a-z]{7})/, // 思源 URL Scheme 正则表达式
                };

                navigator.clipboard.readText().then(async (text) => {
                    for (const regex of Object.values(BlockRegex)) {
                        const match = text.match(regex);
                        if (match) {
                            addItemByBlockId(match[1]);
                            return;
                        }
                    }
                    showMessage(`无法从[${text}]中解析到块`, 5000, "error");
                });
            },
        });
        menu.addItem({
            label: "添加当前文档块",
            icon: "iconAdd",
            click: () => {
                const li = document.querySelector(
                    "ul.layout-tab-bar>li.item--focus"
                );
                if (!li) return;
                const dataId = li.getAttribute("data-id");
                const protyle = document.querySelector(
                    `div.protyle[data-id="${dataId}"] .protyle-title`
                );
                if (!protyle) return;
                const id = protyle.getAttribute("data-node-id");
                addItemByBlockId(id);
            },
        });
        menu.open({
            x: e.clientX,
            y: e.clientY,
        });
    };

    const itemDelete = (detail: IBookmarkItem) => {
        let title = detail.title;
        if (title.length > 20) {
            title = title.slice(0, 20) + "...";
        }
        confirm(
            `是否删除书签项目${title}?`,
            "⚠️ 删除后无法恢复！确定删除吗？",
            () => {
                model.delItem(props.group.id, detail.id);
            }
        );
    };

    const checkDragOveredItem = (e: DragEvent) => {
        const target = e.target as HTMLElement;
        const li = target.closest('li.b3-list-item') as HTMLElement;
        if (li == null) return null;
        if (li.classList.contains(ClassName.GroupHeader)) {
            return { type: 'group', id: "" };
        } else if (li.classList.contains(ClassName.Item)) {
            return { type: 'item', id: li.getAttribute('data-node-id') };
        }
        return null;
    };

    const onDragOver = (event: DragEvent) => {
        const type = event.dataTransfer.types[0];
        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setIsDragOver(true);
        } else if (type === 'bookmark/item') {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setIsDragOver(true);
            const overedItem = checkDragOveredItem(event);
            if (!overedItem) return;
            // moveItemDetail.update((value) => {
            //     value.targetGroup = props.group.id;
            //     value.afterItem = overedItem.id;
            //     return value;
            // });
            setItemMoving((value) => {
                value.targetGroup = props.group.id;
                value.afterItem = overedItem.id;
                return value;
            })
        }
    };

    const onDragLeave = (event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
        setIsDragOver(false);
    };

    const onDrop = async (event: DragEvent) => {
        const type = event.dataTransfer.types[0];
        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
            const meta = type.replace(Constants.SIYUAN_DROP_GUTTER, "");
            const info = meta.split(Constants.ZWSP);
            const nodeId = info[2];
            addItemByBlockId(nodeId);
        } else if (type === 'bookmark/item') {
            model.moveItem(itemMoving());
            // moveItemDetail.set({
            //     srcGroup: "",
            //     srcItem: "",
            //     targetGroup: "",
            //     afterItem: "",
            // });
            setItemMoving({
                srcGroup: "",
                srcItem: "",
                targetGroup: "",
                afterItem: "",
            });
        }
        setIsDragOver(false);
    };

    const svgArrowClass = () => isOpen() ? "b3-list-item__arrow--open" : "";
    const itemsClass = () => isOpen() ? "" : "fn__none";

    return (
        <section
            class={`custom-bookmark-group ${isDragOver() ? 'dragover' : ''}`}
            data-groupid={props.group.id}
            data-groupname={props.group.name}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            role="list"
        >
            <li
                class={`b3-list-item b3-list-item--hide-action custom-bookmark-group-header ${dragovered()} ${groupDrop() === props.group.id ? 'b3-list-item--focus' : ''}`}
                style="--file-toggle-width:20px"
                data-treetype="bookmark"
                data-type="undefined"
                data-subtype="undefined"
                data-groupid={props.group.id}
                data-groupname={props.group.name}
                onClick={() => {
                    // highlightedGroup.set(props.group.id);
                    setGroupDrop(props.group.id);
                    toggleOpen();
                    model.save();
                }}
                onContextMenu={showGroupContextMenu}
            >
                <span
                    style="padding-left: 4px; margin-right: 2px"
                    class="b3-list-item__toggle b3-list-item__toggle--hl"
                >
                    <svg class={`b3-list-item__arrow ${svgArrowClass()}`}>
                        <use href="#iconRight"></use>
                    </svg>
                </span>
                <svg class="b3-list-item__graphic">
                    <use href="#iconFolder"></use>
                </svg>
                <span class="b3-list-item__text ariaLabel" data-position="parentE">
                    {props.group.name}
                </span>
                <span
                    class="b3-list-item__action"
                    onClick={(e) => {
                        e.stopPropagation();
                        showGroupContextMenu(e);
                    }}
                >
                    <svg>
                        <use href="#iconMore"></use>
                    </svg>
                </span>
                <span class="counter">{orderedItems().length}</span>
            </li>
            <ul
                class={`custom-bookmark-group-list ${itemsClass()}`}
                data-groupid={props.group.id}
                data-groupname={props.group.name}
            >
                <For each={orderedItems()}>
                    {(item: IItemOrder, _) => (
                        <Item group={props.group.id} block={item.id} deleteItem={itemDelete} />
                    )}
                </For>
            </ul>
        </section>
    );
};

export default Group;
