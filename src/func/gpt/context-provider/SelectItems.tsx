// h:\SrcCode\SiYuanDevelopment\sy-f-misc\src\func\gpt\context-provider\SelectItems.tsx
// 多选ContextSubmenuItem

import { solidDialog } from "@/libs/dialog";
import { Component, createSignal, For } from "solid-js";
import styles from './SelectItems.module.scss'; // 导入 CSS Modules

interface ContextSubmenuItem {
    id: string;
    title: string;
    description?: string;
}

interface SelectItemsProps {
    candidates: ContextSubmenuItem[];
    confirm: (selected: ContextSubmenuItem[]) => void;
    options?: {
        multiChoice?: boolean;  // 是否允许多选, 默认 true
        defaultAllSelected?: boolean;
    };
}

const SelectItems: Component<SelectItemsProps> = (props) => {
    const multiChoice = () => props.options?.multiChoice ?? true;
    // let defaultSelected = props.options?.defaultAllSelected === true ? props.candidates : [props.candidates.length > 0 ? props.candidates[0] : null];
    let defaultSelected = [];
    if (props.options?.defaultAllSelected === true) {
        defaultSelected = props.candidates;
    } else if (props.candidates.length > 0) {
        defaultSelected = [props.candidates[0]];
    }
    const [selectedItems, setSelectedItems] = createSignal<ContextSubmenuItem[]>(defaultSelected);

    const toggleItem = (item: ContextSubmenuItem) => {
        if (multiChoice()) {
            setSelectedItems(prev => {
                if (prev.some(i => i.id === item.id)) {
                    return prev.filter(i => i.id !== item.id);
                } else {
                    return [...prev, item];
                }
            });
        } else {
            setSelectedItems([item]);
        }
    };

    const isSelected = (item: ContextSubmenuItem) => {
        return selectedItems().some(i => i.id === item.id);
    };

    const handleConfirm = () => {
        props.confirm(selectedItems());
    };

    return (
        <div class={styles.container}>
            <div class={styles.footer}>
                {multiChoice() && (
                    <>
                        <button class="b3-button b3-button--outline" onClick={() => {
                            setSelectedItems(props.candidates);
                        }}>全选</button>
                        <button class="b3-button b3-button--outline" onClick={() => {
                            props.candidates.forEach(item => {
                                toggleItem(item);
                            });
                        }}>反选</button>
                    </>
                )}
                <button class="b3-button" onClick={handleConfirm}>确认</button>
            </div>
            <For each={props.candidates}>
                {(item) => (
                    <div
                        onClick={() => toggleItem(item)}
                        class={`${styles.item} ${isSelected(item) ? styles.selected : ''}`}
                    >
                        <div class={styles.title}>{item.title}</div>
                        {item.description && <div class={styles.description}>{item.description}</div>}
                    </div>
                )}
            </For>
        </div>
    );
};

const showSelectContextDialog = async (candidates: ContextSubmenuItem[], options: {
    confirm: (selected: ContextSubmenuItem[]) => void,
    destroyCallback: () => void,
    defaultAllSelected?: boolean,
    multiChoice?: boolean;  // 是否允许多选, 默认 true
}) => {
    const { close } = solidDialog({
        title: '选择上下文',
        loader: () => (
            <SelectItems candidates={candidates} confirm={(selected) => {
                options.confirm(selected);
                close();
            }} options={options}
            />
        ),
        callback: () => {
            options.destroyCallback();
        },
        width: '800px',
        height: '600px'
    });
};

export default showSelectContextDialog;
