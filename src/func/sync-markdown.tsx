/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-07 15:34:04
 * @FilePath     : /src/func/sync-markdown.tsx
 * @LastEditTime : 2024-08-11 14:48:22
 * @Description  : 
 */
import { Component, createMemo, createSignal, JSXElement, Switch, Match, Show } from "solid-js";

import { FormInput as InputItem, FormWrap as ItemWrap } from '@/libs/components/Form';

import type FMiscPlugin from "@/index";
import { confirmDialog, solidDialog } from "@/libs/dialog";
import { IEventBusMap, showMessage } from "siyuan";
import { exportMdContent, getBlockAttrs, getBlockByID, request, setBlockAttrs } from "@/api";

import { formatDateTime } from "@/utils/time";


const nodeFs = require('fs');
const nodePath = require('path');
const electron = require('electron');

const I18N = {
    zh_CN: {
        warn: '⚠️ 注意Asset目录已更改！',
        menuLabel: '同本地 Markdown 文件同步',
        notSet: '请先选择导出目录',
        docName: '文档名称',
        docNameDesc: '导出的 Markdown 文件名',
        exportDir: '导出文档目录',
        exportDirDesc: '导出的 *.md 文件会被保存到这里',
        mdExportDirPlaceholder: 'MD 文件导出目录',
        choose: '选择',
        assetDir: '资源文件目录',
        assetDirDesc: 'Markdown 文件中的资源文件（如图片等）会被保存到这里',
        assetPrefix: 'Asset路径前缀',
        assetPrefixDesc: 'Markdown 文件中的图片路径前缀, 可以是绝对路径、 相对路径或者自行填写',
        absolutePath: '绝对路径',
        relativePath: '相对路径',
        succssConfirm: '已经导出到: {0}；是否需要跳转到文件夹？',
        mdfilepath: 'Markdown 文件路径',
        assetpattern: 'MD 文件中资源链接的样式'
    },
    en_US: {
        warn: '⚠️ Warning: Asset directory has changed!',
        menuLabel: 'Sync With Local Markdown File',
        notSet: 'Please select the export directory first',
        docName: 'Document Name',
        docNameDesc: 'Name of the exported Markdown file',
        exportDir: 'Export Document Directory',
        exportDirDesc: 'The exported *.md file will be saved to this directory',
        mdExportDirPlaceholder: 'MD File Export Directory',
        choose: 'Choose',
        assetDir: 'Asset Directory',
        assetDirDesc: 'The directory where the assets (such as images) in the Markdown file are saved',
        assetPrefix: 'Asset Path Prefix',
        assetPrefixDesc: 'The prefix for image paths in the Markdown file. It can be an absolute path, relative path, or custom.',
        absolutePath: 'Absolute Path',
        relativePath: 'Relative Path',
        succssConfirm: 'Exported to: {0}; Do you want to jump to the folder?',
        mdfilepath: 'MD File Path',
        assetpattern: 'Pattern of asset link in Markdown file'
    }
};


let i18n: typeof I18N.zh_CN = window.siyuan.config.lang in I18N ? I18N[window.siyuan.config.lang] : I18N.en_US;


const chooseDirectory = async (setter: (value: string) => void) => {

    const remote = require('@electron/remote');

    const webApproach = () => {
        let input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        //@ts-ignore
        input.directory = true;
        input.style.display = 'none';
        input.onchange = (event) => {
            //@ts-ignore
            const files = event.target.files;
            if (files.length > 0) {
                const path: string = files[0].path;
                const directoryPath = path.replace(/\\/g, '/');
                let dir = directoryPath.split('/');
                dir.pop();
                let dirPath = dir.join('/');
                setter(dirPath);
            }
        };
        input.click();
    }
    const nodeApproach = () => {
        const { dialog } = remote;
        dialog.showOpenDialog({
            properties: ['openDirectory']
        }).then(result => {
            if (!result.canceled && result.filePaths.length > 0) {
                setter(result.filePaths[0]);
            }
        }).catch(err => {
            console.error("Failed to choose directory:", err);
        });
    }

    if (!remote) {
        webApproach();
    } else {
        nodeApproach();
    }
}

function useMDConfig(props: Parameters<typeof SyncMdConfig>[0]) {
    let [fname, setFname] = createSignal(props.fname);
    let [mdDir, setMdDir] = createSignal(props.mdDir);
    let [assetDir, setAssetDir] = createSignal(props.assetDir);
    let [assetPrefix, setAssetPrefix] = createSignal(props.assetPrefix);
    const [warning, setWarning] = createSignal(false);

    const assetPattern = createMemo(() => {
        let prefix = assetPrefix();
        if (prefix === '') return `${i18n.assetpattern}: ![xxx](xxx.png)`;
        else return `${i18n.assetpattern}: ![](${prefix}/xxx.png)`;
    });


    const updateFname = (fname: string) => {
        setFname(fname);
        props.updateFname(fname);
    };

    const updateMdDir = (dir: string) => {
        setMdDir(dir);
        props.updateMdDir(dir);
        if (assetDir() === '') {
            updateAssetDir(`${dir}/assets`);
        }
    }

    const updateAssetDir = (dir: string) => {
        setAssetDir(dir);
        props.updateAsset(dir);
        setWarning(true);
    }


    const updateAssetPrefix = (prefix: string) => {
        setAssetPrefix(prefix)
        props.updateAssetPrefix(prefix);
        setWarning(false);
        console.debug(`Asset prefix: ${prefix}`);
    }

    return {
        fname,
        mdDir,
        assetDir,
        assetPrefix,
        warning,
        updateFname,
        updateMdDir,
        updateAssetDir,
        updateAssetPrefix,
        assetPattern
    };
}

const checkFile = (fpath: string): { exist: boolean, updatedTime?: any } => {
    let exist = nodeFs.existsSync(fpath);
    if (exist) {
        let stat = nodeFs.statSync(fpath);
        return { exist: true, updatedTime: formatDateTime('yyyy-MM-dd HH:mm:ss', stat.mtime) };
    } else {
        return { exist: false };
    }
}

const SyncMdConfig: Component<{
    fname: string,
    mdDir: string,
    assetDir: string,
    assetPrefix: string,
    updateFname: (v: string) => void,
    updateMdDir: (v: string) => void,
    updateAsset: (v: string) => void,
    updateAssetPrefix: (v: string) => void,
    confirm: () => void,
    cancel: () => void
}> = (props) => {

    const {
        fname,
        mdDir,
        assetDir,
        assetPrefix,
        warning,
        updateFname,
        updateMdDir,
        updateAssetDir,
        updateAssetPrefix,
        assetPattern
    } = useMDConfig(props);


    const exportMdFileStatus = createMemo(() => {
        let file = fname();
        let dir = mdDir();
        if (dir === '' || file === '') return {
            exist: false,
            text: ''
        };
        let path = `${dir}/${file}.md`;
        let status = checkFile(path);
        if (status.exist === false) {
            return {
                path,
                exist: false,
                text: '<span style="font-weight: bold;">文件尚不存在</span>'
            };
        } else {
            return {
                path,
                exist: true,
                text: `<span style="font-weight: bold; color: var(--b3-theme-primary)">文件已存在，上次更改时间: ${status.updatedTime}</span>`
            };
        }
    });

    const WarningArea = (p: { children: JSXElement }) => (
        <div style="position: relative;">
            <span style={{
                ...{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    color: 'var(--b3-card-warning-color)',
                    'background-color': 'var(--b3-card-warning-background)',
                    border: '3px solid var(--b3-theme-warning)',
                    "border-radius": '5px',
                    padding: '3px'
                },
                ...(warning() ? {
                    display: "block",
                } : {
                    display: "none",
                }
                )
            }}>{i18n.warn}</span>
            {p.children}
        </div>
    );

    const LocalMDFileStatus = () => {
        return (
            <div class="b3-label__text" style={{
                padding: '8px 24px', 'border-bottom': '2px solid var(--b3-theme-primary)',
                display: 'flex', gap: '5px',
                'align-items': 'center'
            }}>
                <div class="fn__flex-1" style={{"line-height": '1.5rem'}}>
                    <div>{i18n.mdfilepath}: <u>{exportMdFileStatus().path}</u></div>
                    <div innerHTML={exportMdFileStatus().text}></div>
                </div>
                <div class="fn__flex fn__flex-column" style="gap: 5px;">
                    <Show when={exportMdFileStatus().exist}>
                        <button class="b3-button fn__block ariaLabel" aria-label="Coming Soon..." disabled>导入内容</button>
                    </Show>
                    <button class="b3-button fn__block" onClick={props.confirm}>
                        导出内容
                    </button>
                </div>
            </div>
        );
    };

    const Body = () => (
        <div style={{ flex: 1, display: "flex", "flex-direction": "column", padding: '16px 4px;' }}>
            <LocalMDFileStatus />

            <ItemWrap
                title={i18n.docName}
                description={i18n.docNameDesc}
                direction="column"
            >
                <InputItem
                    type="textinput"
                    key="fname"
                    value={props.fname}
                    placeholder={i18n.docName}
                    changed={(v) => {
                        updateFname(v);
                    }}
                />
            </ItemWrap>

            <ItemWrap
                title={i18n.exportDir}
                description={i18n.exportDirDesc}
                direction="row"
            >
                <div style={{ display: "flex", gap: '5px' }}>
                    <InputItem
                        type="textinput"
                        key="md-dir"
                        value={mdDir()}
                        placeholder={i18n.mdExportDirPlaceholder}
                        style={{ flex: '1' }}
                        changed={(v) => {
                            updateMdDir(v);
                        }}
                    />
                    <button
                        class="b3-button"
                        style="max-width: 100px"
                        onClick={() => {
                            chooseDirectory(updateMdDir);
                        }}
                    >
                        {i18n.choose}
                    </button>
                </div>
            </ItemWrap>
            <ItemWrap
                title={i18n.assetDir}
                description={i18n.assetDirDesc}
                direction="row"
            >
                <div style={{ display: "flex", gap: '5px' }}>
                    <InputItem
                        type="textinput"
                        key="asset-dir"
                        value={assetDir()}
                        placeholder={i18n.assetDir}
                        style={{ flex: '1' }}
                        changed={(v) => {
                            updateAssetDir(v);
                        }}
                    />
                    <button
                        class="b3-button"
                        style="max-width: 100px"
                        onClick={() => {
                            chooseDirectory(updateAssetDir);
                        }}
                    >
                        {i18n.choose}
                    </button>
                </div>
            </ItemWrap>
            <WarningArea>
                <ItemWrap
                    title={i18n.assetPrefix}
                    description={i18n.assetPrefixDesc}
                    direction="row"
                >
                    <div style={{ display: "flex", gap: '5px' }}>
                        <InputItem
                            type="textinput"
                            key="asset-prefix"
                            value={assetPrefix()}
                            placeholder={i18n.assetPrefix}
                            style={{ flex: '1' }}
                            changed={(v) => {
                                updateAssetPrefix(v);
                            }}
                        />
                        <button
                            class="b3-button"
                            style="max-width: 100px"
                            onClick={() => {
                                updateAssetPrefix(assetDir());
                            }}
                        >
                            {i18n.absolutePath}
                        </button>
                        <button
                            class="b3-button"
                            style="max-width: 100px"
                            onClick={() => {
                                let path = nodePath.relative(mdDir(), assetDir());
                                updateAssetPrefix(path);
                            }}
                        >
                            {i18n.relativePath}
                        </button>
                    </div>
                    <div>{assetPattern()}</div>
                </ItemWrap>
            </WarningArea>
        </div>
    );

    return (
        <Body />
    );
};

const doExport = async (document: Block, mdPath: string, assetDir: string, assetPrefix: string) => {

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
                    confirm: () => {
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