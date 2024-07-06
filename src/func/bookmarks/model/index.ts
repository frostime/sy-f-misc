import { unwrap } from "solid-js/store";

import type FMiscPlugin from "@/index";

import { getBlocks, getDocInfos } from "../libs/data";
import { rmItem, insertItem, moveItem } from "../libs/op";
import { showMessage } from "siyuan";
import { batch } from "solid-js";

import { debounce } from '@/utils';

import {
    itemInfo,
    setItemInfo,
    setGroups,
    groupMap,
    configs,
    setConfigs,
    groups
} from './stores';
import { getRule } from "./rules";
export * from './stores';

const StorageNameBookmarks = 'bookmarks';  //书签
const StorageFileConfigs = 'bookmark-configs.json';  //书签插件相关的配置
const StorageFileItemSnapshot = 'bookmark-items-snapshot.json';  //书签项目的缓存，防止出现例如 box 关闭导致插件以为书签被删除的问题


export class BookmarkDataModel {
    plugin: FMiscPlugin;

    constructor(plugin: FMiscPlugin) {
        this.plugin = plugin;
    }

    async load() {
        let bookmarks = await this.plugin.loadData(StorageNameBookmarks + '.json');
        let configs_ = await this.plugin.loadData(StorageFileConfigs);
        let snapshot: { [key: BlockId]: IBookmarkItemInfo } = await this.plugin.loadData(StorageFileItemSnapshot);

        if (configs_) {
            setConfigs(configs_);
        }

        this.plugin.data.bookmarks = bookmarks ?? {};
        snapshot = snapshot ?? {};

        const allGroups = [];
        for (let [_, group] of Object.entries(this.plugin.data.bookmarks)) {
            let items: IItemCore[] = group.items.map(item => ({ id: item.id, style: item?.style }));

            let groupV2: IBookmarkGroup = { ...group, items };
            allGroups.push(groupV2);
            group.items.map(item => {
                if (itemInfo[item.id] !== undefined) {
                    setItemInfo(item.id, 'ref', (ref) => ref + 1);
                    return;
                }
                let iteminfo: IBookmarkItemInfo = {
                    id: item.id,
                    title: snapshot[item.id]?.title ?? '',
                    type: snapshot[item.id]?.type ?? 'p',
                    box: snapshot[item.id]?.box ?? '',
                    subtype: snapshot[item.id]?.subtype ?? '',
                    icon: snapshot[item.id]?.icon ?? '',
                    ref: 1
                };
                setItemInfo(item.id, iteminfo);
            });
        }
        batch(() => {
            allGroups.forEach((groupV2) => {
                setGroups((gs) => [...gs, groupV2])
            })
        })
    }

    private async saveCore(fpath?: string) {
        console.log('save bookmarks');
        let result: { [key: TBookmarkGroupId]: IBookmarkGroup } = {};

        for (let [id, group] of groupMap()) {
            result[id] = unwrap(group);
            let items = unwrap(result[id].items);
            //如果是动态规则，就只保存一部分自定义过的 item
            if (group.type === 'dynamic') {
                items = items.filter(item => item.style);
            }
            result[id].items = items;
        }
        this.plugin.data.bookmarks = result;
        fpath = fpath ?? StorageNameBookmarks + '.json';
        await this.plugin.saveData(fpath, this.plugin.data.bookmarks);
        await this.plugin.saveData(StorageFileConfigs, configs);
        await this.plugin.saveData(StorageFileItemSnapshot, itemInfo);
    }

    save = debounce(this.saveCore.bind(this), 500);

    hasItem(id: BlockId, groupId?: TBookmarkGroupId) {
        if (groupId === undefined) {
            return itemInfo[id] !== undefined
        } else {
            let group = groupMap().get(groupId);
            if (group) {
                return group.items.some(item => item.id === id);
            } else {
                return false;
            }
        }
    }

    async updateAll() {
        let toUpdated: Promise<any>[] = [];
        groups.forEach(group => {
            if (group.hidden) return;
            if (group.type === 'dynamic') {
                toUpdated.push(this.updateDynamicGroup(group));
            }
        });
        await Promise.all(toUpdated);
        this.updateItems();
    }

    /**
     * 查询动态规则中的块
     * @param group
     * @returns
     */
    async updateDynamicGroup(group: IBookmarkGroup) {
        if (group.type !== 'dynamic') return;
        if (!group.rule) return;
        let rule = getRule(group.rule);
        if (!rule) {
            showMessage(`未能正确解析配置规则: ${group.name}`);
            return;
        }
        if (!rule.validateInput()) {
            showMessage(`分组规则输入格式有误: ${group.name}`);
            return;
        }
        let blocks: Block[] = await rule.fetch();

        let blocksMap: Map<BlockId, Block> = new Map();
        blocks.forEach(b => {
            blocksMap.set(b.id, b);
        });

        let idsInFetch: string[] = blocks.map(b => b.id);
        let idsInGroup: string[] = group.items.map(b => b.id);

        let idsInFetchSet = new Set(idsInFetch);
        let idsInGroupSet = new Set(idsInGroup);
        // 新增的 id (在 idsInFetch 中但不在 idsInGroup 中)
        let addedIds = Array.from(idsInFetchSet).filter(id => !idsInGroupSet.has(id));
        // 被删掉的 id (在 idsInGroup 中但不在 idsInFetch 中)
        let removedIds = Array.from(idsInGroupSet).filter(id => !idsInFetchSet.has(id));

        //update item infos, 要首先更新 items 在更新 group
        batch(() => {
            //删掉已经不存在的 items
            removedIds.forEach(id => {
                let item = itemInfo[id];
                if (item) {
                    let ref = item.ref;
                    if (ref === 1) {
                        setItemInfo(id, undefined!);
                    } else {
                        setItemInfo(id, 'ref', (ref) => ref - 1);
                    }
                }
            });
            //添加新的 items
            addedIds.forEach(id => {
                let item = itemInfo[id];
                if (item) {
                    //引用 +1
                    setItemInfo(item.id, 'ref', (ref) => ref + 1);
                    return;
                } else {
                    //新增条目
                    let block = blocksMap.get(id);
                    const { name, fcontent, content, box, type, subtype } = block;
                    let iteminfo = {
                        id, title: name || fcontent || content,
                        box, type, subtype: subtype,
                        icon: '', ref: 1
                    };
                    setItemInfo(id, iteminfo);
                }
            });
            //更新 group
            let itemCores: { [key: string]: IItemCore } = group.items.reduce((acc, item) => {
                acc[item.id] = item;
                return acc;
            }, {});
            setGroups((g) => g.id === group.id, 'items', () => {
                let iitemcores = idsInFetch.map(id => {
                    return {id, style: itemCores?.[id]?.style ?? ''};
                });
                return iitemcores;
            })
        });

    }

    async updateItems() {
        console.debug('更新所有 Bookmark items');
        //1. 获取所有的 block 的最新内容
        let items = Object.values(itemInfo);
        let ids = items.map(item => item.id);
        let blocks = await getBlocks(...ids);
        //2. 更新文档块的 logo
        let docsItem: DocumentId[] = [];
        Object.values(blocks).forEach(block => {
            if (block?.type === 'd') {
                docsItem.push(block.id);
            }
        });
        let docInfos = await getDocInfos(...docsItem);

        //3. 更新 this.items 和 writable store
        const notebookMap = window.siyuan.notebooks.reduce((acc, notebook) => {
            acc[notebook.id] = notebook;
            return acc;
        }, {});

        let allItems = Object.entries(itemInfo);
        allItems.forEach(([id, item], _) => {
            let block = blocks[id];
            if (block) {
                const { name, fcontent, content, box, type, subtype } = block;
                const ni: IBookmarkItemInfo = {
                    id: item.id,
                    title: name || fcontent || content,
                    box,
                    type,
                    subtype: subtype || '',
                    err: undefined,
                    icon: '',
                    ref: item.ref
                };
                let icon = '';
                if (ni.type === 'd') {
                    let docInfo = docInfos[id];
                    if (docInfo) {
                        icon = docInfo.rootIcon;
                    }
                }
                ni.icon = icon;
                setItemInfo(id, ni);
            } else {
                console.warn(`block ${id} not found`);
                let obj = {
                    title: '',
                    err: ''
                }
                if (notebookMap?.[item.box]?.closed === true) {
                    obj.title = `笔记本「${notebookMap[item.box].name}」已经关闭`;
                    obj.err = 'BoxClosed';
                } else {
                    obj.title = `无法找到内容块，可能已经被删除！旧块内容：${JSON.stringify(item)}`;
                    obj.err = 'BlockDeleted';
                }
                batch(() => {
                    setItemInfo(id, 'title', obj.title);
                    //@ts-ignore
                    setItemInfo(id, 'err', obj.err);
                });
            }
            // ItemInfoStore[id].set({ ...item });
        });
        console.debug('更新所有 Bookmark items 完成');
    }

    listItems(group?: TBookmarkGroupId) {
        const listItems = (group: IBookmarkGroup) => {
            return group.items.map(itmin => itemInfo[itmin.id]);
        }
        if (group) {
            let g = groupMap().get(group);
            if (g) {
                return listItems(g);
            } else {
                return [];
            }
        } else {
            let items: IBookmarkItemInfo[] = [];
            groupMap().forEach(group => {
                items.push(...listItems(group));
            });
            return items;
        }
    }

    newGroup(name: string, type?: TBookmarkGroupType, rule?: IDynamicRule) {
        //6位 36进制
        let id: TBookmarkGroupId;
        while (id === undefined || groupMap().has(id)) {
            id = Math.random().toString(36).slice(-6);
        }
        let group = {
            id,
            name,
            items: [],
            type,
            rule
        };

        setGroups((gs) => [...gs, group]);
        this.updateDynamicGroup(group);
        this.save();
        return group;
    }

    delGroup(id: TBookmarkGroupId) {
        if (groupMap().has(id)) {
            setGroups((gs: IBookmarkGroup[]) => gs.filter((g) => g.id !== id));
            this.save();
            return true;
        } else {
            return false;
        }
    }

    moveGroup(fromIndex: number, toIndex: number) {
        setGroups((groups) => moveItem(groups, fromIndex, toIndex));
        this.save();
    }

    renameGroup(id: TBookmarkGroupId, name: string) {
        let group = groupMap().get(id);
        if (group) {
            setGroups((g) => g.id === id, 'name', name);
            this.save();
            return true;
        } else {
            return false;
        }
    }

    addItem(gid: TBookmarkGroupId, item: IBookmarkItem) {
        let group = groupMap().get(gid);
        if (group) {
            let exist = itemInfo[item.id] !== undefined;
            if (!exist) {
                let iteminfo = { ...item, icon: '', ref: 0 };
                setItemInfo(item.id, iteminfo);
            } else if (this.hasItem(item.id, gid)) {
                console.warn(`addItem: item ${item.id} already in group ${gid}`);
                return false;
            }

            setGroups((g) => g.id === gid, 'items', (items) => {
                return [...items, { id: item.id }]
            })
            setItemInfo(item.id, 'ref', (ref) => ref + 1);
            this.save();
            return true;
        } else {
            return false;
        }
    }

    delItem(gid: TBookmarkGroupId, id: BlockId) {
        let group = groupMap().get(gid);
        if (group) {
            setGroups((g) => g.id === gid, 'items', (items: IItemCore[]) => {
                return items.filter(item => item.id !== id);
            })

            let item = itemInfo[id];
            if (item) {
                let ref = item.ref;
                if (ref === 1) {
                    setItemInfo(id, undefined!);
                } else {
                    setItemInfo(id, 'ref', (ref) => ref - 1);
                }
            }
            this.save();
            return true;
        } else {
            return false;
        }
    }

    /**
     * 将 item 移动到 gid 下
     * @param gid 
     * @param id 
     * @returns 
     */
    transferItem(fromGroup: TBookmarkGroupId, toGroup: TBookmarkGroupId, item: IBookmarkItemInfo) {
        if (fromGroup === toGroup) {
            return false;
        }
        let from = groupMap().get(fromGroup);
        let to = groupMap().get(toGroup);
        if (!(from && to)) {
            return false;
        }
        if (to.items.some(itmin => itmin.id === item.id)) {
            showMessage('该项已经在目标分组中', 4000, 'error');
            return false;
        }
        let fromitem = from.items.find(itmin => itmin.id === item.id);
        if (!fromitem) {
            showMessage('源分组中没有该项', 4000, 'error');
            return false;
        }

        batch(() => {
            setGroups((g) => g.id === fromGroup, 'items', (items: IItemCore[]) => {
                return items.filter(it => it.id != item.id);
            });
            setGroups((g) => g.id === toGroup, 'items', (items: IItemCore[]) => {
                return [...items, fromitem];
            });
        });

        this.save();
        return true;
    }

    reorderItem(gid: TBookmarkGroupId, item: IBookmarkItemInfo, order: 'top' | 'bottom') {
        let group = groupMap().get(gid);
        if (!group) {
            return false;
        }
        let items = group.items;
        let index = items.findIndex(itmin => itmin.id === item.id);
        if (index === -1) {
            return false;
        }

        if (order === 'top' && index !== 0) {
            setGroups(group.index, 'items', (items) => moveItem(items, index, 0));
        } else if (order === 'bottom' && index !== items.length - 1) {
            setGroups(group.index, 'items', (items) => moveItem(items, index, items.length - 1));
        }
        this.save();
        return true;
    }

    moveItem(detail: IMoveItemDetail) {
        let { srcGroup, targetGroup, srcItem, afterItem } = detail;
        let src = groupMap().get(srcGroup);
        let target = groupMap().get(targetGroup);
        if (!(src && target)) {
            return false;
        }
        if (srcItem === afterItem) return;

        let srcIndex = src.items.findIndex(itmin => itmin.id === srcItem);
        if (srcIndex === -1) {
            return false;
        }

        //check if exists in target group
        if (srcGroup !== targetGroup && target.items.some(itmin => itmin.id === srcItem)) {
            showMessage('该项已经在目标分组中', 4000, 'error');
            return false;
        }

        //计算新插件的项目的顺序
        let toIndex: number = 0;
        if (afterItem === '') {
            //如果 afterItem 为空, 则相当于直接把 srcItem 移动到 targetGroup 最前面
            toIndex = 0;
        } else {
            //如果 afterItem 不为空, 则相当于把 srcItem 移动到 afterItem 之后
            let afterIndex = target.items.findIndex(itmin => itmin.id === afterItem);
            if (afterIndex === -1) {
                return false;
            }
            toIndex = afterIndex + 1;
        }

        if (srcGroup === targetGroup) {
            setGroups(src.index, 'items', (items) => moveItem(items, srcIndex, toIndex));
        } else {
            batch(() => {
                setGroups((g) => g.id === srcGroup, 'items', (items) => rmItem(items, srcIndex));
                setGroups((g) => g.id === targetGroup, 'items', (items) => insertItem(items, { id: srcItem, style: 'newOrder' }, toIndex));
            });
        }
        console.debug(`moveItem: ${srcItem} from ${srcGroup} to ${targetGroup} after ${afterItem}`);
        this.save();
        return true;
    }
}


let model: BookmarkDataModel = null;

// const sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// globalThis.updateBookmarkOrder = async () => {
//     for (let [id, group] of model.groups) {
//         group.order = newOrderByTime();
//         console.log(`group ${id} order updated: ${group.order}`);
//         for (let [index, item] of group.items.entries()) {
//             item.order = newOrderByTime();
//             console.log(`   item ${item.id} order updated: ${item.order}`);
//             await sleep(500);
//         }
//     }
//     model.save();
// }


export const getModel = (plugin?: FMiscPlugin) => {
    if (model === null && plugin === undefined) {
        throw new Error('model not initialized');
    }
    if (plugin) {
        model = new BookmarkDataModel(plugin);
    }
    return model;
}

export const rmModel = () => {
    model = null;
}

