/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-16 13:51:27
 * @FilePath     : /src/func/docfile-tools.ts
 * @LastEditTime : 2025-02-16 22:13:43
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import { html2ele, openBlock, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { moveDocsByID } from "@frostime/siyuan-plugin-kits/api";

export let name = "InboxFunctions";
export let enabled = false;

export const declareToggleEnabled = {
    title: '📑 文档工具',
    description: '一些文档管理相关的工具',
    defaultEnabled: false
};

// 位置: useDocItemSelection 函数
const useDocItemSelection = () => {
    let selectedFiletreeItems = new Set<{
        id: string;
        name: string;
    }>();

    let panel = html2ele('<div class="f-misc-fileitem-selection-panel b3-menu"></div>');
    // 内联样式
    panel.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 100px;
        background-color: var(--b3-menu-background);
        padding: 10px;
        z-index: 1000;
        max-height: 300px;
        min-width: 200px;
        overflow-y: auto;
        display: none; /* 初始隐藏 */
    `;
    document.body.appendChild(panel);

    const updateSelectionPanel = () => {
        panel.innerHTML = ''; // 清空现有内容
        if (selectedFiletreeItems.size === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block'; // 显示面板

        const itemElement = html2ele(`
            <div class="f-misc-selection-item b3-menu__item" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 5px;
            ">
                <span class="block-ref b3-menu__label">全部清空</span>
                <span class="f-misc-selection-remove" style="
                    cursor: pointer;
                    color: var(--b3-theme-on-surface);
                    margin-left: 10px;
                "></span>
            </div>
        `);
        panel.appendChild(itemElement);
        itemElement.onclick = () => {
            selectedFiletreeItems.clear();
            updateSelectionPanel(); // 清空后更新显示
        };

        selectedFiletreeItems.forEach(item => {
            const itemElement = html2ele(`
                <div class="f-misc-selection-item b3-menu__item" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 5px;
                ">
                    <span class="block-ref b3-menu__label popover__block" data-id="${item.id}">${item.name}</span>
                    <span class="f-misc-selection-remove" data-id="${item.id}" style="
                        cursor: pointer;
                        color: var(--b3-theme-on-surface);
                        margin-left: 10px;
                    ">X</span>
                </div>
            `);
            panel.appendChild(itemElement);

            // 添加删除事件
            // itemElement.querySelector('.f-misc-selection-remove').addEventListener('click', (event) => {
            //     const idToRemove = (event.target as HTMLElement).dataset.id;
            //     selectedFiletreeItems.forEach(i => {
            //         if (i.id === idToRemove) {
            //             selectedFiletreeItems.delete(i);
            //         }
            //     });
            //     updateSelectionPanel(); // 更新显示
            // });
            itemElement.onclick = (event: MouseEvent) => {
                const ele = event.target as HTMLElement;
                if (ele?.closest('.f-misc-selection-remove')) {
                    const idToRemove = item.id;
                    if (idToRemove) {
                        selectedFiletreeItems.forEach(i => {
                            if (i.id === idToRemove) {
                                selectedFiletreeItems.delete(i);
                            }
                        });
                        updateSelectionPanel(); // 更新显示
                    }
                    return;
                }
                openBlock(item.id);
            };
        });
    };

    return {
        add: (item: { id: string; name: string }) => {
            if (selectedFiletreeItems.has(item)) return;
            selectedFiletreeItems.add(item);
            updateSelectionPanel(); // 添加后更新显示
        },
        clear: () => {
            selectedFiletreeItems.clear();
            updateSelectionPanel(); // 清空后更新显示
        },
        list: () => {
            return Array.from(selectedFiletreeItems);
        }
    }
}

const selection = useDocItemSelection();

let dispoer1 = () => {};
let dispoer2 = () => {};

export const load = (_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    const plugin = thisPlugin();

    dispoer1 = plugin.registerEventbusHandler('open-menu-doctree', (detail) => {
        console.log(detail);
        if (detail.type === 'notebook') return;
        const elements = Array.from(detail.elements);
        const submenu =  [
            {
                label: '添加到移动缓存区',
                icon: 'iconArrowDown',
                click: () => {
                    elements.forEach(ele => {
                        selection.add({
                            id: ele.dataset.nodeId,
                            name: (ele.querySelector('span.b3-list-item__text') as HTMLElement)?.innerText || ele.dataset.name
                        });
                    });
                }
            }
        ]
        if (elements.length === 1 && selection.list().length > 0) {
            const ele = elements[0];
            submenu.push(            {
                label: '移动到当前文档下',
                icon: 'iconMove',
                click: async () => {
                    await moveDocsByID(selection.list().map(i => i.id), ele.dataset.nodeId);
                    selection.clear();
                }
            })
        }
        detail.menu.addItem({
            label: '移动文档工具',
            icon: 'iconFile',
            submenu
        })
    });


    dispoer2 = plugin.registerEventbusHandler('click-editortitleicon', (detail) => {
        console.log(detail);
        const docId = detail.data.rootID;
        const submenu =  [
            {
                label: '添加到移动缓存区',
                icon: 'iconArrowDown',
                click: () => {
                    selection.add({
                        id: docId,
                        name: detail.data.name
                    });
                }
            }
        ];
        if (selection.list().length > 0) {
            submenu.push({
                label: '移动到当前文档下',
                icon: 'iconMove',
                click: async () => {
                    await moveDocsByID(selection.list().map(i => i.id), docId);
                    selection.clear();
                }
            });
        }
        detail.menu.addItem({
            label: '移动文档工具',
            icon: 'iconFile',
            submenu
        })
    });
};

export const unload = (_: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    selection.clear();
    dispoer1();
    dispoer2();
    dispoer1 = () => {};
    dispoer2 = () => {};
};
