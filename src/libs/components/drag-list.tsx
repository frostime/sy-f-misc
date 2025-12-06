import { For, createSignal, JSX, Show, createMemo } from "solid-js";
import SvgSymbol from "./Elements/IconSymbol";
import { CollapsibleContainer } from "./collapsible";

/**
 * Headless 可拖拽列表组件
 * 
 * 设计理念：
 * 1. 零样式依赖 - 不导入任何 CSS
 * 2. 零 UI 组件依赖 - 不依赖任何图标库或按钮组件
 * 3. 完全由使用者控制渲染 - 提供渲染函数而非配置对象
 * 4. 只负责状态管理和拖拽逻辑
 */

export interface DraggableListItem<T = any> {
    id: string | number;
    data: T;  // 所有数据都放在 data 中，不预设任何字段
}

export interface DraggableListRenderProps<T> {
    // 当前项的数据
    item: DraggableListItem<T>;
    index: number;

    // 拖拽状态（响应式 getter 函数）
    isDragging: () => boolean;
    isDragOver: () => boolean;

    // 拖拽事件处理器（需要绑定到 DOM）
    dragHandlers: {
        draggable: boolean;
        onDragStart: (e: DragEvent) => void;
        onDragOver: (e: DragEvent) => void;
        onDrop: (e: DragEvent) => void;
        onDragEnd: (e: DragEvent) => void;
    };
}


export function HeadlessDraggableList<T>(props: {
    // 数据
    items: DraggableListItem<T>[];

    // 核心渲染函数 - 完全控制每一项的渲染
    children: (props: DraggableListRenderProps<T>) => JSX.Element;

    // 容器渲染函数（可选）
    renderContainer?: (children: JSX.Element) => JSX.Element;

    // 空状态渲染（可选）
    renderEmpty?: () => JSX.Element;

    // 功能开关
    disabled?: boolean;

    // 拖拽约束（可选）
    canDrag?: (item: DraggableListItem<T>) => boolean;
    canDrop?: (draggedItem: DraggableListItem<T>, targetItem: DraggableListItem<T>) => boolean;

    // 回调
    onOrderChange?: (items: DraggableListItem<T>[]) => void;
    onDragStart?: (item: DraggableListItem<T>) => void;
    onDragEnd?: () => void;
}): JSX.Element {
    const [draggedIndex, setDraggedIndex] = createSignal<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = createSignal<number | null>(null);

    // const C = children(() => props.children);

    const items = () => props.items;
    const disabled = () => props.disabled ?? false;

    const handleDragStart = (index: number) => (e: DragEvent) => {
        if (disabled()) return;

        const item = items()[index];
        if (props.canDrag && !props.canDrag(item)) {
            e.preventDefault();
            return;
        }

        setDraggedIndex(index);
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', String(index));

        props.onDragStart?.(item);
    };

    const handleDragOver = (index: number) => (e: DragEvent) => {
        if (disabled()) return;

        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDrop = (targetIndex: number) => (e: DragEvent) => {
        if (disabled()) return;

        e.preventDefault();
        const sourceIndex = draggedIndex();

        if (sourceIndex === null || sourceIndex === targetIndex) {
            handleDragEnd();
            return;
        }

        const draggedItem = items()[sourceIndex];
        const targetItem = items()[targetIndex];

        // 检查是否允许放置
        if (props.canDrop && !props.canDrop(draggedItem, targetItem)) {
            handleDragEnd();
            return;
        }

        // 执行排序
        const newItems = [...items()];
        newItems.splice(sourceIndex, 1);
        newItems.splice(targetIndex, 0, draggedItem);

        props.onOrderChange?.(newItems);

        handleDragEnd();
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
        props.onDragEnd?.();
    };

    // 将每一项包装成组件，确保响应式更新
    const ListItem = (itemProps: { item: DraggableListItem<T>; index: number }) => {
        const canDragThis = createMemo(() => {
            if (disabled()) return false;
            return props.canDrag ? props.canDrag(itemProps.item) : true;
        });

        // 传递 getter 函数而不是值，保持响应式
        return props.children({
            item: itemProps.item,
            index: itemProps.index,
            isDragging: () => draggedIndex() === itemProps.index,
            isDragOver: () => dragOverIndex() === itemProps.index,
            dragHandlers: {
                draggable: canDragThis(),
                onDragStart: handleDragStart(itemProps.index),
                onDragOver: handleDragOver(itemProps.index),
                onDrop: handleDrop(itemProps.index),
                onDragEnd: handleDragEnd
            }
        });
    };

    const listContent = (
        <For each={items()}>
            {(item, index) => <ListItem item={item} index={index()} />}
        </For>
    );

    // 处理空状态
    if (items().length === 0 && props.renderEmpty) {
        return props.renderEmpty();
    }

    // 使用自定义容器或默认 fragment
    return props.renderContainer
        ? props.renderContainer(listContent)
        : listContent;
}

/**
 * 便捷 Hook：管理选中状态
 */
export function useListSelection<T>(items: () => DraggableListItem<T>[]) {
    const [selected, setSelected] = createSignal<Set<string | number>>(new Set());

    const isSelected = (id: string | number) => selected().has(id);

    const toggle = (id: string | number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAll = () => {
        setSelected(new Set(items().map(item => item.id)));
    };

    const clearAll = () => {
        setSelected(new Set<number | string>());
    };

    const getSelected = () => {
        const selectedIds = selected();
        return items().filter(item => selectedIds.has(item.id));
    };

    return {
        selected,
        isSelected,
        toggle,
        selectAll,
        clearAll,
        getSelected
    };
}

// ==============================================
// 便捷组件：基础可拖拽列表
// ==============================================

type BasicListItem = {
    name: string;
    id?: string | number;
    [key: string]: any;
}

export interface BasicDraggableListProps<T extends BasicListItem = BasicListItem> {
    items: T[];
    onEdit?: (item: T) => void;
    onDelete?: (item: T) => void;
    onOrderChange?: (items: T[]) => void;

    // 自定义渲染
    /** 在名称后面渲染额外元素（如徽章、状态图标） */
    renderBadge?: (item: T) => JSX.Element;
    /** 在操作按钮前渲染额外元素 */
    renderActions?: (item: T) => JSX.Element;

    // 移动按钮支持
    showMoveButtons?: boolean;
    onMoveUp?: (item: T, index: number) => void;
    onMoveDown?: (item: T, index: number) => void;

    // 拖拽约束
    canDrop?: (draggedItem: T, targetItem: T) => boolean;

    // 样式定制
    containerClass?: string;
    itemClass?: string;

    // 空状态
    emptyText?: string;
}

export function BasicDraggableList<T extends BasicListItem = BasicListItem>(
    props: BasicDraggableListProps<T>
) {
    const items = (): DraggableListItem<T>[] => {
        return props.items.map((p, index) => ({ id: p.id ?? index, data: p }));
    };

    const defaultContainerStyle: JSX.CSSProperties = {
        display: 'flex',
        'flex-direction': 'column',
        gap: '4px'
    };

    const defaultItemStyle: JSX.CSSProperties = {
        display: 'flex',
        gap: '10px',
        'align-items': 'center',
        padding: '8px 16px',
        margin: '0 22px',
        border: '1px solid var(--b3-border-color)',
        'border-radius': '4px',
        'box-shadow': '0 2px 4px var(--b3-theme-surface-light)',
        cursor: 'move',
        'user-select': 'none'
    };

    return (
        <HeadlessDraggableList
            items={items()}
            onOrderChange={(newItems) => {
                const newData = newItems.map(item => item.data);
                props.onOrderChange?.(newData);
            }}
            canDrop={props.canDrop ? (dragged, target) => props.canDrop!(dragged.data, target.data) : undefined}
            renderContainer={(children) => (
                <div class={props.containerClass} style={props.containerClass ? undefined : defaultContainerStyle}>
                    {children}
                </div>
            )}
            renderEmpty={props.emptyText ? () => (
                <div style={{
                    padding: '10px',
                    'text-align': 'center',
                    color: 'var(--b3-theme-on-surface)'
                }}>
                    {props.emptyText}
                </div>
            ) : undefined}
        >
            {({ item, index, dragHandlers, isDragging, isDragOver }) => (
                <div
                    {...dragHandlers}
                    class={props.itemClass}
                    style={{
                        ...(props.itemClass ? {} : defaultItemStyle),
                        opacity: isDragging() ? 0.5 : 1,
                        'background-color': isDragOver() ? 'var(--b3-theme-surface)' : 'transparent'
                    }}
                >
                    <span style={{ flex: 1, 'font-weight': 'bold' }}>
                        {item.data.name}
                    </span>

                    {props.renderBadge?.(item.data)}

                    {props.showMoveButtons && (
                        <>
                            <button
                                class="b3-button b3-button--text"
                                onClick={() => props.onMoveUp?.(item.data, index)}
                            >
                                <SvgSymbol size="15px">iconUp</SvgSymbol>
                            </button>
                            <button
                                class="b3-button b3-button--text"
                                onClick={() => props.onMoveDown?.(item.data, index)}
                            >
                                <SvgSymbol size="15px">iconDown</SvgSymbol>
                            </button>
                        </>
                    )}

                    {props.renderActions?.(item.data)}

                    {props.onEdit && (
                        <button
                            class="b3-button b3-button--text"
                            onClick={() => props.onEdit!(item.data)}
                        >
                            <SvgSymbol size="15px">iconEdit</SvgSymbol>
                        </button>
                    )}

                    {props.onDelete && (
                        <button
                            class="b3-button b3-button--text"
                            onClick={() => props.onDelete!(item.data)}
                        >
                            <SvgSymbol size="15px">iconTrashcan</SvgSymbol>
                        </button>
                    )}
                </div>
            )}
        </HeadlessDraggableList>
    );
}


// ==============================================
// 高级组件：可折叠的拖拽列表
// ==============================================

export interface CollapsibleDraggableListProps<T extends BasicListItem = BasicListItem>
    extends BasicDraggableListProps<T> {
    /** 分组标题 */
    title: string;
    /** 初始是否展开，默认 true */
    defaultExpanded?: boolean;
    /** 受控模式：外部控制展开状态 */
    expanded?: boolean;
    /** 展开状态变化回调 */
    onExpandedChange?: (expanded: boolean) => void;
    /** 添加按钮点击回调，不传则不显示添加按钮 */
    onAdd?: () => void;
    /** 添加按钮的图标，默认 iconAdd */
    addIcon?: string;
    /** 标题栏额外的操作按钮 */
    headerActions?: JSX.Element;
    /** 容器样式类名 */
    wrapperClass?: string;
    /** 标题栏样式 */
    headerStyle?: JSX.CSSProperties;
    /** 容器样式 */
    containerStyle?: JSX.CSSProperties;
}

export function CollapsibleDraggableList<T extends BasicListItem = BasicListItem>(
    props: CollapsibleDraggableListProps<T>
) {
    // 构建标题栏的操作按钮
    const actions = () => (
        <>
            {props.headerActions}
            <Show when={props.onAdd}>
                <button
                    class="b3-button b3-button--text"
                    onClick={(e) => {
                        e.stopPropagation();
                        props.onAdd?.();
                    }}
                >
                    <SvgSymbol size="18px">{props.addIcon ?? 'iconAdd'}</SvgSymbol>
                </button>
            </Show>
        </>
    );

    return (
        <CollapsibleContainer
            title={props.title}
            defaultExpanded={props.defaultExpanded}
            expanded={props.expanded}
            onExpandedChange={props.onExpandedChange}
            actions={actions()}
            containerClass={props.wrapperClass}
            headerStyle={props.headerStyle}
            containerStyle={props.containerStyle}
        >
            <BasicDraggableList
                items={props.items}
                onEdit={props.onEdit}
                onDelete={props.onDelete}
                onOrderChange={props.onOrderChange}
                renderBadge={props.renderBadge}
                renderActions={props.renderActions}
                showMoveButtons={props.showMoveButtons}
                onMoveUp={props.onMoveUp}
                onMoveDown={props.onMoveDown}
                canDrop={props.canDrop}
                containerClass={props.containerClass}
                itemClass={props.itemClass}
                emptyText={props.emptyText}
            />
        </CollapsibleContainer>
    );
}