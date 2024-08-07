/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-07 15:34:04
 * @FilePath     : /src/func/custom-export.tsx
 * @LastEditTime : 2024-08-07 22:21:10
 * @Description  : 
 */
import { Component, createSignal, JSXElement } from "solid-js";
import ItemWrap from '@/libs/components/item-wrap';
import InputItem from "@/libs/components/item-input";
import type FMiscPlugin from "@/index";
import { solidDialog } from "@/libs/dialog";
import { IEventBusMap, showMessage } from "siyuan";
import { exportMdContent, getBlockAttrs, getBlockByID, request, setBlockAttrs } from "@/api";
import DialogAction from "@/libs/components/dialog-action";


const nodeFs = require('fs');
const nodePath = require('path');

const I18N = {
    zh_CN: {
        warn: '⚠️ 注意Asset目录已更改！',
        menuLabel: '自定义导出 MD 文件',
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
        relativePath: '相对路径'
    },
    en_US: {
        warn: '⚠️ Warning: Asset directory has changed!',
        menuLabel: 'Custom Export MD File',
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
        relativePath: 'Relative Path'
    }
};


let i18n: typeof I18N.zh_CN = window.siyuan.config.lang in I18N ? I18N[window.siyuan.config.lang] : I18N.en_US;


const ExportConfig: Component<{
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
}
> = (props) => {

    let [mdDir, setMdDir] = createSignal(props.mdDir);
    let [assetDir, setAssetDir] = createSignal(props.assetDir);
    let [assetPrefix, setAssetPrefix] = createSignal(props.assetPrefix);

    let [warning, setWarning] = createSignal(false);

    /**
     * Choose a local dir, and use setter to propagate it
     * @param setter
     */
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
                ...(warning() ?
                    {
                        display: "block",
                    } : {
                        display: "none",
                    }
                )
            }}>{i18n.warn}</span>
            {p.children}
        </div>
    );


    const Body = () => (
        <div style={{ flex: 1, display: "flex", "flex-direction": "column" }}>
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
                        props.updateFname(v);
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
                            setMdDir(v);
                            props.updateMdDir(v);
                            if (assetDir() === '') {
                                updateAssetDir(`${v}/assets`);
                            }
                        }}
                    />
                    <button
                        class="b3-button"
                        style="max-width: 100px"
                        onClick={() => {
                            chooseDirectory(setMdDir);
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
                </ItemWrap>
            </WarningArea>
        </div>
    );

    return (
        <div class="fn__flex fn__flex-column fn__flex-1">
            <Body />
            <DialogAction
                onCancel={props.cancel}
                onConfirm={props.confirm}
            />
        </div>
    )
};

const doExport = async (document: Block, mdPath: string, assetDir: string, assetPrefix: string) => {

    let { hPath, content } = await exportMdContent(document.id);

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
    })
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

            const dialog = solidDialog({
                'title': i18n.menuLabel,
                loader: () => ExportConfig({
                    fname: fname || doc.content,
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


export let name = "CustomExport";
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