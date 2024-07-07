import { Component, createEffect, createMemo, createSignal, Match, useContext } from "solid-js";
import { For, Switch } from "solid-js";
import { Menu, Constants, confirm, showMessage } from "siyuan";
import Item from "./item";
import { inputDialogSync } from "@/libs/dialog";
import { groups, setGroups, configs, itemInfo } from "../model";
import { ClassName } from "../libs/dom";
import { getBlockByID } from "@/api";

import { BookmarkContext, itemMoving, setItemMoving, groupDrop, setGroupDrop } from "./context";


interface Props {
    group: IBookmarkGroup;
    groupDelete: (g: IBookmarkGroup) => void;
    groupMove: (e: { to: string, group: IBookmarkGroup }) => void;
}

const Group: Component<Props> = (props) => {
    const { model, doAction } = useContext(BookmarkContext);

    const isDynamic = () => props.group.type === 'dynamic';

    let shownItems = createMemo(() => {
        let index = groups.findIndex((g) => g.id === props.group.id);
        let group = groups[index];
        let items = group.items.slice();
        if (configs.hideClosed) {
            items = items.filter((it) => itemInfo[it.id]?.err !== 'BoxClosed');
        }
        if (configs.hideDeleted) {
            items = items.filter((it) => itemInfo[it.id]?.err !== 'BlockDeleted');
        }
        // return items.sort((a, b) => a.order - b.order);
        return items;
    });

    const isOpen = createMemo(() => {
        let index = groups.findIndex((g) => g.id === props.group.id);
        let group = groups[index];
        return group.expand !== undefined ? !group.expand : true;
    });

    const toggleOpen = (open?: boolean) => {
        let expand = !(open !== undefined ? open : !isOpen());
        setGroups((g) => g.id === props.group.id, 'expand', expand);
        model.save();
    };

    /**
     * 订阅来自顶层的指令信号
     */
    createEffect(() => {
        let action = doAction();
        if (action === "AllExpand") {
            toggleOpen(true);
        } else if (action === "AllCollapse") {
            toggleOpen(false);
        }
    })

    const [isDragOver, setIsDragOver] = createSignal(false);

    const dragovered = createMemo(() => {
        let value = itemMoving();
        if (value.targetGroup === props.group.id && value.afterItem === '') {
            return 'dragovered';
        } else {
            return '';
        }
    });

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
        if (props.group.type === 'dynamic') {
            menu.addItem({
                label: '刷新',
                icon: 'iconRefresh',
                click: () => {
                    model.updateDynamicGroup(props.group);
                }
            });
            menu.addSeparator();
        }
        menu.addItem({
            label: "复制为引用列表",
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
        menu.addItem({
            label: "复制为链接列表",
            icon: "iconSiYuan",
            click: () => {
                const items = model.listItems(props.group.id);
                const refs = items
                    .map(
                        (item) =>
                            `* [${item.title.replaceAll("\n", "")}](${item.id})`
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
                    const idlist = shownItems().map(item => item.id);
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
            label: '移动',
            icon: 'iconMove',
            type: 'submenu',
            submenu: [
                {
                    label: "置顶",
                    icon: "iconTop",
                    click: async () => {
                        props.groupMove({ to: 'top', group: props.group });
                    },
                },
                {
                    label: "上移",
                    icon: "iconUp",
                    click: async () => {
                        props.groupMove({ to: 'up', group: props.group });
                    },
                },
                {
                    label: "下移",
                    icon: "iconDown",
                    click: async () => {
                        props.groupMove({ to: 'down', group: props.group });
                    },
                },
                {
                    label: "置底",
                    icon: "iconTop",
                    iconClass: "rotate-180",
                    click: async () => {
                        props.groupMove({ to: 'bottom', group: props.group });
                    },
                }
            ]
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
        if (isDynamic()) return;
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
            setItemMoving((value) => {
                return { ...value, targetGroup: props.group.id, afterItem: overedItem.id };
            })
        }
    };

    const onDragLeave = (event: DragEvent) => {
        if (isDynamic()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
        setIsDragOver(false);
    };

    const onDrop = async (event: DragEvent) => {
        if (isDynamic()) return;
        const type = event.dataTransfer.types[0];
        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
            const meta = type.replace(Constants.SIYUAN_DROP_GUTTER, "");
            const info = meta.split(Constants.ZWSP);
            const nodeId = info[2];
            addItemByBlockId(nodeId);
        } else if (type === 'bookmark/item') {
            model.moveItem(itemMoving());
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
            style={{
                transition: 'background-color 0.2s ease-in-out'
            }}
        >
            <li
                class={`b3-list-item b3-list-item--hide-action custom-bookmark-group-header ${dragovered()} ${groupDrop() === props.group.id ? 'b3-list-item--focus' : ''}`}
                data-groupid={props.group.id}
                data-groupname={props.group.name}
                onClick={() => {
                    setGroupDrop(props.group.id);
                    toggleOpen();
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
                    <Switch fallback={<use href="#iconFolder"></use>}>
                        <Match when={props.group.type === 'normal'}>
                            <use href="#iconFolder"></use>
                        </Match>
                        <Match when={isDynamic()}>
                            <use href="#iconSearch"></use>
                        </Match>
                    </Switch>
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
                <span class="counter">{shownItems().length}</span>
            </li>
            <ul
                class={`custom-bookmark-group-list ${itemsClass()}`}
                data-groupid={props.group.id}
                data-groupname={props.group.name}
            >
                <For each={shownItems()}>
                    {(item: IItemCore) => (
                        <Item group={props.group.id} itemCore={item} deleteItem={itemDelete} />
                    )}
                </For>
            </ul>
        </section>
    );
};

export default Group;
