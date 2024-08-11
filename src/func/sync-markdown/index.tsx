/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-07 15:34:04
 * @FilePath     : /src/func/sync-markdown/index.tsx
 * @LastEditTime : 2024-08-11 15:24:55
 * @Description  : 
 */
import { IEventBusMap, showMessage } from "siyuan";

import type FMiscPlugin from "@/index";
import { solidDialog } from "@/libs/dialog";
import { getBlockAttrs, getBlockByID, setBlockAttrs } from "@/api";

import SyncMdConfig from './md-config';
import { doExport, doImport } from "./do-port";

import i18n from './i18n';

const nodeFs = window.require('fs');
const nodePath = window.require('path');

const updateCustomAttr = async (
    document: Block, fname: string, mdDir: string,

    assetDir: string, assetPrefix: string
) => {
    setBlockAttrs(document.id, {
        'custom-export-md': JSON.stringify({
            fname: fname,
            mdDir: mdDir,
            assetDir: assetDir,
            assetPrefix: assetPrefix
        })
    });
}

const getCustomAttr = async (document: Block) => {
    let attr = await getBlockAttrs(document.id);
    let data = { fname: '', mdDir: '', assetDir: '', assetPrefix: '' };
    if (attr['custom-export-md']) {
        let cache = JSON.parse(attr['custom-export-md']);
        data = { ...data, ...cache };
    }
    return data;
}


const eventHandler = async (e: CustomEvent<IEventBusMap['click-editortitleicon']>) => {
    let docId = e.detail.data.rootID;
    let menu = e.detail.menu;
    menu.addItem({
        icon: 'iconUpload',
        label: i18n.menuLabel,
        'click': async () => {
            let doc = await getBlockByID(docId);

            let { fname, mdDir, assetDir, assetPrefix } = await getCustomAttr(doc);
            fname = fname || doc.content;

            const dialog = solidDialog({
                'title': i18n.menuLabel,
                loader: () => SyncMdConfig({
                    fname: fname,
                    mdDir, assetDir, assetPrefix,
                    updateFname: (v) => {
                        fname = v;
                    },
                    updateMdDir: (v) => {
                        mdDir = v;
                    },
                    updateAsset: (v) => {
                        assetDir = v;
                    },
                    updateAssetPrefix: (v) => {
                        assetPrefix = v;
                    },
                    import: () => {
                        if (fname && mdDir && assetDir) {
                            let mdPath = nodePath.join(mdDir, `${fname}.md`);
                            doImport(doc, mdPath, assetDir, assetPrefix);
                            updateCustomAttr(doc, fname, mdDir, assetDir, assetPrefix);
                        } else {
                            showMessage(i18n.notSet, 4000, 'error');
                            console.log(`Import failed: ${i18n.notSet}`);
                            console.log(fname, mdDir, assetDir);
                        }
                        dialog.destroy();
                    },
                    export: () => {
                        if (fname && mdDir && assetDir) {
                            let mdPath = nodePath.join(mdDir, `${fname}.md`);
                            doExport(doc, mdPath, assetDir, assetPrefix);
                            updateCustomAttr(doc, fname, mdDir, assetDir, assetPrefix);
                        } else {
                            showMessage(i18n.notSet, 4000, 'error');
                            console.log(`Export failed: ${i18n.notSet}`);
                            console.log(fname, mdDir, assetDir);
                        }
                        dialog.destroy();
                    },
                    cancel: () => {
                        dialog.destroy();
                    }
                }),
                width: '700px'
            })
        }
    })


}


export let name = "SyncMarkdown";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (!nodeFs || !nodePath) return;

    if (enabled) return;
    enabled = true;

    plugin.eventBus.on('click-editortitleicon', eventHandler);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;

    plugin.eventBus.off('click-editortitleicon', eventHandler);
}