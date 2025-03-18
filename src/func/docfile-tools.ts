/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-02-16 13:51:27
 * @FilePath     : /src/func/docfile-tools.ts
 * @LastEditTime : 2025-03-18 18:37:30
 * @Description  : 
 */
import type FMiscPlugin from "@/index";
import { getActiveDoc, openBlock, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { getBlockByID, moveDocsByID } from "@frostime/siyuan-plugin-kits/api";
import { floatingContainer } from "@/libs/components/floating-container";

export let name = "InboxFunctions";
export let enabled = false;

export const declareToggleEnabled = {
    title: '📑 文档工具',
    description: '一些文档管理相关的工具',
    defaultEnabled: false
};


// 定义文档类型
interface DocInfo {
    id: string;
    title?: string;
    content?: string;
    path?: string;
}

// 位置: useDocItemSelection 函数
const useDocItemSelection = () => {
    let selectedFiletreeItems = new Set<{
        id: string;
        name: string;
    }>();

    // 容器相关变量
    let containerDisposer: {
        dispose: () => void;
        container?: HTMLElement;
        containerBody?: HTMLElement;
    } | null = null;
    let panelElement: HTMLElement | null = null;

    // 存储事件监听器引用，以便后续清理
    let eventListeners: Array<{
        element: HTMLElement;
        type: string;
        listener: EventListener;
    }> = [];

    // 添加事件监听器的辅助函数，会记录监听器以便后续清理
    const addEventListenerWithCleanup = (
        element: HTMLElement,
        type: string,
        listener: EventListener
    ) => {
        element.addEventListener(type, listener);
        eventListeners.push({ element, type, listener });
    };

    // 清理所有事件监听器
    const cleanupEventListeners = () => {
        eventListeners.forEach(({ element, type, listener }) => {
            element.removeEventListener(type, listener);
        });
        eventListeners = [];
    };

    // 创建容器
    const createContainer = () => {
        if (containerDisposer) return;

        // 创建面板元素
        panelElement = document.createElement('div');
        panelElement.className = 'f-misc-fileitem-selection-panel b3-menu';
        panelElement.style.maxHeight = '300px';
        panelElement.style.overflowY = 'auto';
        panelElement.style.minWidth = '250px';
        panelElement.style.position = 'relative';

        // 使用浮动容器创建面板
        containerDisposer = floatingContainer({
            element: panelElement,
            initialPosition: { x: window.innerWidth - 300, y: window.innerHeight - 350 },
            title: "文档移动缓存区",
            style: {
                "min-width": "250px",
                "max-height": "400px",
                "border-radius": "var(--b3-border-radius-b)",
                "box-shadow": "var(--b3-dialog-shadow)"
            },
            onClose: () => {
                // 关闭时完全销毁容器和清理事件监听器
                disposeContainer();
            }
        });
    };

    // 销毁容器和清理资源
    const disposeContainer = () => {
        if (containerDisposer) {
            cleanupEventListeners();
            containerDisposer.dispose();
            containerDisposer = null;
            panelElement = null;
        }
    };

    // 创建顶部操作按钮
    const createActionButtons = () => {
        if (!panelElement) return;

        // 创建按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'f-misc-action-buttons';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';
        buttonContainer.style.marginBottom = '10px';
        buttonContainer.style.padding = '5px';
        buttonContainer.style.borderBottom = '1px solid var(--b3-border-color)';

        // 添加当前文档按钮
        const addCurrentButton = document.createElement('button');
        addCurrentButton.className = 'b3-button b3-button--outline';
        addCurrentButton.textContent = '加入当前文档';
        addCurrentButton.style.fontSize = '12px';
        addCurrentButton.style.padding = '4px 8px';
        addCurrentButton.style.marginRight = '5px';

        addEventListenerWithCleanup(addCurrentButton, 'click', async () => {
            try {
                const activeDocResult = await getActiveDoc();
                if (activeDocResult) {
                    // const activeDoc = activeDocResult as DocInfo;
                    let doc = await getBlockByID(activeDocResult);
                    selection.add({
                        id: doc.id,
                        name: doc.content || '未命名文档'
                    });
                }
            } catch (error) {
                console.error('获取当前文档失败', error);
            }
        });

        // 移动到当前文档按钮
        const moveToCurrentButton = document.createElement('button');
        moveToCurrentButton.className = 'b3-button b3-button--outline';
        moveToCurrentButton.textContent = '移动到当前文档下';
        moveToCurrentButton.style.fontSize = '12px';
        moveToCurrentButton.style.padding = '4px 8px';

        addEventListenerWithCleanup(moveToCurrentButton, 'click', async () => {
            try {
                const activeDocResult = await getActiveDoc();
                // 检查返回结果是否是对象并且有id属性
                if (activeDocResult && selectedFiletreeItems.size > 0) {
                    // const activeDoc = activeDocResult as DocInfo;
                    let doc = await getBlockByID(activeDocResult);
                    await moveDocsByID(Array.from(selectedFiletreeItems).map(i => i.id), doc.id);
                    selection.clear();
                }
            } catch (error) {
                console.error('移动文档失败', error);
            }
        });

        // 添加按钮到容器
        buttonContainer.appendChild(addCurrentButton);
        buttonContainer.appendChild(moveToCurrentButton);

        // 将按钮容器添加到面板的最前面
        if (panelElement.firstChild) {
            panelElement.insertBefore(buttonContainer, panelElement.firstChild);
        } else {
            panelElement.appendChild(buttonContainer);
        }
    };

    // 更新选择面板内容
    const updateSelectionPanel = () => {
        // 如果没有选中项，销毁面板
        if (selectedFiletreeItems.size === 0) {
            disposeContainer();
            return;
        }

        // 确保容器已创建
        if (!containerDisposer || !panelElement) {
            createContainer();
        } else {
            // 显示容器
            if (containerDisposer.container) {
                containerDisposer.container.style.display = 'block';
            }
        }

        // 清空面板内容和事件监听器
        if (panelElement) {
            cleanupEventListeners();
            panelElement.innerHTML = '';

            // 添加顶部操作按钮
            createActionButtons();
        }

        // 添加所有选中的项目
        selectedFiletreeItems.forEach(item => {
            if (!panelElement) return;

            const itemElement = document.createElement('div');
            itemElement.className = 'f-misc-selection-item b3-menu__item';
            itemElement.style.display = 'flex';
            itemElement.style.justifyContent = 'space-between';
            itemElement.style.alignItems = 'center';
            itemElement.style.marginBottom = '5px';

            // 创建文档名称元素
            const nameElement = document.createElement('span');
            nameElement.className = 'block-ref b3-menu__label popover__block';
            nameElement.dataset.id = item.id;
            nameElement.style.cursor = 'pointer';
            nameElement.textContent = item.name;

            // 使用辅助函数添加事件监听器
            addEventListenerWithCleanup(nameElement, 'click', () => {
                openBlock(item.id);
            });

            // 创建删除按钮
            const removeButton = document.createElement('span');
            removeButton.className = 'f-misc-selection-remove';
            removeButton.dataset.id = item.id;
            removeButton.style.cursor = 'pointer';
            removeButton.style.color = 'var(--b3-theme-on-surface)';
            removeButton.style.marginLeft = '10px';
            removeButton.textContent = '✕';

            // 使用辅助函数添加事件监听器
            addEventListenerWithCleanup(removeButton, 'click', () => {
                selectedFiletreeItems.forEach(i => {
                    if (i.id === item.id) {
                        selectedFiletreeItems.delete(i);
                    }
                });

                // 如果删除后没有项目了，销毁面板
                if (selectedFiletreeItems.size === 0) {
                    disposeContainer();
                } else {
                    // 否则更新面板
                    updateSelectionPanel();
                }
            });

            // 添加到项目元素
            itemElement.appendChild(nameElement);
            itemElement.appendChild(removeButton);
            panelElement.appendChild(itemElement);
        });
    };

    return {
        add: (item: { id: string; name: string }) => {
            // 检查是否已存在相同ID的项目
            let exists = false;
            selectedFiletreeItems.forEach(i => {
                if (i.id === item.id) {
                    exists = true;
                }
            });
            if (exists) return;

            selectedFiletreeItems.add(item);
            updateSelectionPanel(); // 添加后更新显示
        },
        clear: () => {
            selectedFiletreeItems.clear();
            disposeContainer(); // 清空时完全销毁容器
        },
        list: () => {
            return Array.from(selectedFiletreeItems);
        },
        dispose: () => {
            disposeContainer(); // 完全销毁容器和清理事件监听器
        }
    }
}

const selection = useDocItemSelection();

let dispoer1 = () => { };
let dispoer2 = () => { };

export const load = (_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    const plugin = thisPlugin();

    dispoer1 = plugin.registerEventbusHandler('open-menu-doctree', (detail) => {
        console.log(detail);
        if (detail.type === 'notebook') return;
        const elements = Array.from(detail.elements);
        const submenu = [
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
            submenu.push({
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
        const submenu = [
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
    selection.dispose(); // 完全销毁容器
    dispoer1();
    dispoer2();
    dispoer1 = () => { };
    dispoer2 = () => { };
};
