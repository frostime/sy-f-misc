/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-03-21
 * @FilePath     : /src/func/super-ref-db/index.ts
 */

// import { openBlock } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";
import { getBlockByID } from "@frostime/siyuan-plugin-kits/api";
import { matchIDFormat, openBlock, thisPlugin } from "@frostime/siyuan-plugin-kits";

import { getAvIdFromBlockId } from "@/api/av";
import { configs } from "./core";
import { createBlankSuperRefDatabase, getSuperRefDb, syncDatabaseFromBacklinks } from "./super-ref";
import { showDynamicDatabaseDialog, updateDynamicDatabase, DYNAMIC_DB_ATTR, addRowsToDatabaseFromQuery } from "./dynamic-db";
import "./index.css";

export let name = "SuperRefDB";
export let enabled = false;

// Optional: Configure module settings
export const declareToggleEnabled = {
    title: "🔗 Super Ref",
    description: "自下而上地构建数据库",
    defaultEnabled: false
};


const redirectStrategy = () => configs.doRedirect ? 'fb2p' : 'none';

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: name,
    title: declareToggleEnabled.title,
    load: (values: Record<string, any>) => {
        if (values.doRedirect !== undefined && values.doRedirect !== null) {
            configs.doRedirect = Boolean(values.doRedirect);
        }
        if (values.autoRefreshSuperRef !== undefined) {
            configs.autoRefreshSuperRef = Boolean(values.autoRefreshSuperRef);
        }
        if (values.autoRefreshDynamicDb !== undefined) {
            configs.autoRefreshDynamicDb = Boolean(values.autoRefreshDynamicDb);
        }
        if (values.orphanOfSuperRef !== undefined) {
            configs.orphanOfSuperRef = values.orphanOfSuperRef;
        }
        if (values.orphanOfDynamicDb !== undefined) {
            configs.orphanOfDynamicDb = values.orphanOfDynamicDb;
        }
        if (values.useVarInDynamicDb !== undefined) {
            configs.useVarInDynamicDb = Boolean(values.useVarInDynamicDb);
        }
    },
    dump: () => {
        return configs;
    },
    items: [
        {
            key: 'doRedirect',
            type: 'checkbox',
            title: '重定向双链引用',
            description: `
                开启后，会对双链引用进行重定向: 容器块的首个段落子块会被重定向到容器块本身，标题块和文档块下方的第一个段落子块会被重定向到标题块和文档块本身。<br/>
                <b>注意! 这个选项影响很大， 请不要频繁变动！</b>
            `,
            get: () => configs.doRedirect,
            set: (value: boolean) => {
                configs.doRedirect = value;
            }
        },
        {
            key: 'autoRefreshSuperRef',
            type: 'checkbox',
            title: '自动刷新 SuperRef 数据库',
            description: '在打开对应文档的时候，自动刷新 SuperRef 数据库; 重启后生效',
            get: () => configs.autoRefreshSuperRef,
            set: (value: boolean) => {
                configs.autoRefreshSuperRef = value;
            }
        },
        {
            key: 'orphanOfSuperRef',
            type: 'select',
            title: 'SuperRef 处理孤立条目',
            description: 'SuperRef 更新后对应那些不在反链中的条目如何处理',
            get: () => configs.orphanOfSuperRef,
            set: (orphanOfSuperRef: 'ask' | 'remove' | 'no') => {
                configs.orphanOfSuperRef = orphanOfSuperRef;
            },
            options: {
                ask: '询问用户',
                remove: '直接移除',
                no: '保留'
            }
        },
        {
            key: 'autoRefreshDynamicDb',
            type: 'checkbox',
            title: '自动刷新动态数据库',
            description: '在打开对应文档的时候，自动刷新动态数据库; 重启后生效',
            get: () => configs.autoRefreshDynamicDb,
            set: (value: boolean) => {
                configs.autoRefreshDynamicDb = value;
            }
        },
        {
            key: 'orphanOfDynamicDb',
            type: 'select',
            title: '动态数据库处理孤立条目',
            description: '动态数据库更新后对应那些不在查询结果中的条目如何处理',
            get: () => configs.orphanOfDynamicDb,
            set: (orphanOfDynamicDb: 'ask' | 'remove' | 'no') => {
                configs.orphanOfDynamicDb = orphanOfDynamicDb;
            },
            options: {
                ask: '询问用户',
                remove: '直接移除',
                no: '保留'
            }
        },
        {
            key: 'useVarInDynamicDb',
            type: 'checkbox',
            title: '动态数据库中使用变量插值',
            description: '若开启，可以在动态数据库的代码中使用 {{CurDocId}} 来指代所在文档的 ID',
            get: () => configs.useVarInDynamicDb,
            set: (value: boolean) => {
                configs.useVarInDynamicDb = value;
            }
        },
    ],
};



let unRegister = () => { };

export const load = () => {
    if (enabled) return;
    enabled = true;
    const plugin = thisPlugin();
    let d1 = plugin.registerOnClickDocIcon((detail) => {
        detail.menu.addItem({
            icon: 'iconDatabase',
            label: '创建SuperRef数据库',
            click: () => {
                createBlankSuperRefDatabase(detail.root_id);
            }
        });
        detail.menu.addItem({
            icon: 'iconDatabase',
            label: '打开SuperRef数据库',
            click: async () => {
                const db = await getSuperRefDb(detail.root_id);
                if (!db || !matchIDFormat(db.block)) {
                    showMessage('无法找到SuperRef数据库');
                    return;
                }
                openBlock(db.block, { zoomIn: true });
            }
        });
    });

    // This handler is for attribute view database blocks
    let d2 = plugin.registerOnClickBlockicon((detail) => {
        if (detail.blocks.length !== 1) return;
        const block = detail.blocks[0];
        if (block.type !== 'NodeAttributeView') return;

        const ele = detail.blockElements[0];
        const docId = ele.getAttribute('custom-super-ref-db');
        const dynamicQuery = ele.getAttribute(DYNAMIC_DB_ATTR);

        // Original Super Ref update option for backlinks
        if (docId) {
            detail.menu.addItem({
                icon: 'iconDatabase',
                label: '更新SuperRef数据库',
                click: () => {
                    syncDatabaseFromBacklinks({
                        doc: docId,
                        removeOrphanRows: configs.orphanOfSuperRef,
                        redirectStrategy: redirectStrategy()
                    });
                }
            });
            return;
        }

        // Add dynamic database options based on whether it's already set up
        if (dynamicQuery) {
            // Add update button for dynamic database if it already exists
            detail.menu.addItem({
                icon: 'iconRefresh',
                label: '更新动态数据库',
                click: async () => {
                    await getAvIdFromBlockId(block.id).then(async (avId) => {
                        if (!avId) {
                            showMessage('无法找到数据库视图ID', 3000, 'error');
                            return;
                        }
                        await updateDynamicDatabase(block.id, avId);
                    });
                }
            });
        }
        // Add option to set up dynamic database if it doesn't exist yet
        detail.menu.addItem({
            icon: 'iconSQL',
            label: '设置动态数据库',
            click: () => {
                showDynamicDatabaseDialog(block.id);
            }
        });
        detail.menu.addItem({
            icon: 'iconFeedback',
            label: '从查询结果中添加条目',
            click: () => {
                // 动态数据库绑定的是一个查询语法规则
                // 而这个功能则是让用户临时输入一个新的查询语法
                // 然后将查询结果中的条目添加到数据库中
                // 查询完毕之后也不会保存查询语法
                // 用户输入 - 执行查询 - 获取块 - 添加到数据库
                getAvIdFromBlockId(block.id).then(async (avId) => {
                    if (!avId) {
                        showMessage('无法找到数据库视图ID', 3000, 'error');
                        return;
                    }
                    await addRowsToDatabaseFromQuery({
                        blockId: block.id,
                        avId: avId
                    });
                });
            }
        });
    });
    let d3 = plugin.registerEventbusHandler('open-menu-blockref', (detail) => {
        const span = detail.element;
        const dataId = span.getAttribute('data-id');
        detail.menu.addItem({
            icon: 'iconDatabase',
            label: '绑定为SuperRef',
            click: async () => {
                const block = await getBlockByID(dataId);
                if (!block) return;
                if (block.type !== 'd') return;
                let db = await getSuperRefDb(block.id);
                if (!db) {
                    await createBlankSuperRefDatabase(block.id);
                } else {
                    await syncDatabaseFromBacklinks({
                        doc: block.id,
                        database: db,
                        removeOrphanRows: 'no', //特殊情况, 不在数据库所在的页面，就避免触发 ask 模式
                        redirectStrategy: redirectStrategy()
                    });
                }
            }
        });
    });

    let d4 = () => { };
    if (configs.autoRefreshSuperRef || configs.autoRefreshDynamicDb) {
        d4 = plugin.registerEventbusHandler('loaded-protyle-static', (details) => {
            const { protyle } = details;
            if (configs.autoRefreshSuperRef) {
                const db = protyle.element.querySelectorAll('[data-type="NodeAttributeView"][custom-super-ref-db]');
                if (db?.length > 0) {
                    showMessage('自动更新 SuperRef 数据库...', 3000, 'info');
                    db.forEach(async (dbElement) => {
                        const bindDocId = dbElement.getAttribute('custom-super-ref-db');
                        if (!bindDocId) return;
                        await syncDatabaseFromBacklinks({
                            doc: bindDocId,
                            removeOrphanRows: configs.orphanOfSuperRef,
                            redirectStrategy: redirectStrategy()
                        });
                    });
                }
            }
            if (configs.autoRefreshDynamicDb) {
                const db = protyle.element.querySelectorAll(`[data-type="NodeAttributeView"][${DYNAMIC_DB_ATTR}]`);
                if (db?.length > 0) {
                    showMessage('自动更新动态数据库...', 3000, 'info');
                    db.forEach(async (dbElement) => {
                        const id = dbElement.getAttribute('data-node-id');
                        if (!id) return;
                        const avId = await getAvIdFromBlockId(id);
                        if (!avId) {
                            // showMessage('无法找到数据库视图ID', 3000, 'error');
                            return;
                        }
                        await updateDynamicDatabase(id, avId);
                    });
                }
            }
        });
    }

    unRegister = () => {
        d1();
        d2();
        d3();
        d4();
    };
};

export const unload = () => {
    if (!enabled) return;
    enabled = false;
    unRegister();
    unRegister = () => { };
};
