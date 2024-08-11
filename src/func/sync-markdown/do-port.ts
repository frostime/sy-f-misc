/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-11 14:55:52
 * @FilePath     : /src/func/sync-markdown/do-port.ts
 * @LastEditTime : 2024-08-11 15:22:52
 * @Description  : 
 */
import { showMessage } from "siyuan";

import { confirmDialog } from "@/libs/dialog";
import { exportMdContent, request } from "@/api";


import i18n from './i18n';

const nodeFs = window.require('fs');
const nodePath = window.require('path');
const electron = window.require('electron');


export const doImport = async (
    doc: Block,
    mdPath: string,
    assetDir: string,
    assetPrefix: string
) => {
    //读取 mdpath 文件的文本内容
    let content = nodeFs.readFileSync(mdPath, 'utf8');

    //解析 md 文件当中所有的 asset (![...](...))
    const assetRegex = /!\[.*?\]\((.*?)\)/g;
    let match;
    let assets: string[] = [];
    while ((match = assetRegex.exec(content)) !== null) {
        assets.push(match[1]);
    }

    //解析所有的 asset 的 link 地址
    for (let asset of assets) {
        let localPath = asset.replace(assetPrefix, assetDir);
        console.log(`Asset 文件: ${localPath}`)
    }

    // 更新文档内容
    // await request('/api/block/updateBlock', {
    //     id: doc.id,
    //     data: content,
    //     dataType: 'markdown'
    // });

    // console.log(`Import success: ${mdPath}`);
    // showMessage(`Import from: ${mdPath}`, 6000);
}

export const doExport = async (document: Block, mdPath: string, assetDir: string, assetPrefix: string) => {

    let { content } = await exportMdContent(document.id);

    let assets: string[] = await request('/api/asset/getDocImageAssets', { id: document.id });

    if (assets) {
        //check assetDir
        if (!nodeFs.existsSync(assetDir)) {
            nodeFs.mkdirSync(assetDir, { recursive: true });
        }

        // Replace asset URLs in the markdown content
        let replaceMaps: Record<string, string> = assets.reduce((obj, asset) => {
            obj[asset] = nodePath.join(assetPrefix, nodePath.basename(asset));
            return obj;
        }, {});
        for (let [oldPath, newPath] of Object.entries(replaceMaps)) {
            content = content.replace(new RegExp(oldPath, 'g'), newPath);
        }

        const dataDir = window.siyuan.config.system.dataDir;
        for (let asset of assets) {
            const sourcePath = nodePath.join(dataDir, asset);
            const destPath = nodePath.join(assetDir, nodePath.basename(asset));
            nodeFs.copyFileSync(sourcePath, destPath);
            console.log(`Copying ${sourcePath} ---> ${destPath}`);
        }
    }

    // Save the modified Markdown content
    nodeFs.writeFileSync(mdPath, content, 'utf8');
    console.log(`Export success: ${mdPath}`);
    // let fileUri = `file:///${mdPath.replace(/\\/g, '/')}`

    showMessage(`Export to: ${mdPath}`, 6000);
    confirmDialog({
        title: 'Export Success',
        content: i18n.succssConfirm.replace('{0}', `<a href="${mdPath}" target="_blank">${mdPath}</a>`),
        width: '600px',
        confirm: () => {
            electron.shell.showItemInFolder(mdPath);
        }
    });
}

