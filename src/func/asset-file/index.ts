/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-19 20:13:28
 * @Description  :
 * @FilePath     : /src/func/asset-file/index.ts
 * @LastEditTime : 2025-12-31 20:28:32
 */
import { Protyle, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { confirmDialog, inputDialog, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { openIframeDialog, openIframeTab } from "@/func/html-pages/core";
import { LocalDiskVFS } from "@/libs/vfs";
import { documentDialog } from "@/libs/dialog";
import { err, ok, ResultData } from "@/libs/simple-fp";
import { siyuanVfs } from "@/libs/vfs/vfs-siyuan-adapter";
import { openImageAnnotator } from "./annotate-image";
import { addEditAssetMenu } from "./edit-asset";

export const declareToggleEnabled = {
    title: '📄 附件文件',
    description: '创建空白附件文件, 查看所有附件等...',
    defaultEnabled: true
};

const BLANK_FILE_DIR = '/data/public/blank-files';

const tryToFindBlankFile = async (ext: string): Promise<ResultData<Blob, string>> => {

    const hasDir = await siyuanVfs.exists(BLANK_FILE_DIR);
    if (!hasDir) {
        return err('思源 public/blank-files 目录不存在');
    }

    const ans = await siyuanVfs.readdir(BLANK_FILE_DIR);
    if (!ans.ok) {
        return err('无法读取思源 public/blank-files 目录');
    }

    const target = ans.items.find(item => item.name.endsWith(`.${ext}`));
    if (!target) {
        return err(`思源 public/blank-files 目录下不存在 .${ext} 的空白文件模板`);
    }

    const fileAns = await siyuanVfs.readFile(siyuanVfs.join(BLANK_FILE_DIR, target.name), 'blob');
    if (!fileAns.ok) {
        return err(`无法读取思源 public/blank-files/${target.name} 文件`);
    }

    return ok(fileAns.data as Blob);
}

// ============ 核心业务逻辑（完全不变）============

const mimeTypes: { [key: string]: string } = {
    'txt': 'text/plain',
    'md': 'text/plain',
    'drawio': 'application/vnd.jgraph.mxfile',
    'csv': 'text/csv',
    'json': 'application/json',
    'js': 'text/plain',
    'xml': 'application/xml',
    'html': 'text/html',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'pdf': 'application/pdf',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed'
};

const BlankFileContent = {
    drawio: `<mxfile host="Electron" modified="2024-04-04T12:48:56.358Z" agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) draw.io/24.0.4 Chrome/120.0.6099.109 Electron/28.1.0 Safari/537.36" etag="2hwdI9Fb9SLygm8eVMT2" version="24.0.4" type="device">
    <diagram name="第 1 页" id="lQk7rp0_sSzAOVxkQR8i">
      <mxGraphModel dx="1548" dy="936" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0">
        <root>
          <mxCell id="0" />
          <mxCell id="1" parent="0" />
        </root>
      </mxGraphModel>
    </diagram>
  </mxfile>`
}

const createEmptyFileObject = (fname: string): File => {
    const ext = fname.split('.').pop() || '';
    const mimeType = mimeTypes[ext.toLowerCase()] || 'text/plain';
    let content = BlankFileContent?.[ext];
    let blobParts = content ? [content] : [];
    const emptyBlob = new Blob(blobParts, { type: mimeType });
    const emptyFile = new File([emptyBlob], fname, {
        type: mimeType,
        lastModified: Date.now()
    });
    return emptyFile;
};

// let USE_DEFINED_FILES = {};

/**
 * 新建空白的文件, 上传到思源的附件中
 * @param fname 文件名称，可能包含路径前缀，例如: "Office/report.docx" 或 "test.md"
 * @param addId 是否添加ID到文件名，默认为true
 */
const addNewEmptyFile = async (fname: string, addId: boolean = true) => {
    let prefix = '';
    let name = '';
    if (fname.includes('/')) {
        const parts = fname.split('/');
        name = parts.pop();
        prefix = parts.join('/');
    } else {
        name = fname;
    }

    let basename = name.split('.').slice(0, -1).join('.');
    let ext = name.split('.').pop() || '';

    let file: File | null = null;

    // 步骤1-2: 首先尝试获取空白模板文件
    const blankFileResult = await tryToFindBlankFile(ext);

    if (!blankFileResult.ok) {
        // 步骤4: 如果没有模板，检查是否必须要模板
        const errorMsg = blankFileResult.error;
        if (SHOULD_USE_BLANK_FILE.includes(ext)) {
            // 步骤5: 必须要模板，弹出警告并返回失败
            confirmDialog({
                title: `无法创建 .${ext} 文件`,
                content: `⚠️ 创建 .${ext} 文件需要空白模板文件。\n${errorMsg}\n\n请在 <工作空间>/data/public/blank-files/ 目录下放置对应的空白模板文件。`
            });
            return {
                ok: false,
                error: `${errorMsg}，且该文件类型必须使用模板`
            };
        } else {
            // 步骤6: 不是必须要模板，fallback 到创建空白文件
            file = createEmptyFileObject(name);
            if (!file) {
                return {
                    ok: false,
                    error: '无法创建空白文件'
                };
            }
        }
    } else {
        // 步骤3: 如果有模板，使用模板
        const blob = blankFileResult.data;
        const mimeType = mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
        file = new File([blob], name, {
            type: mimeType,
            lastModified: Date.now()
        });
    }

    let newFname = '';
    if (addId) {
        const ID = window.Lute.NewNodeID();
        newFname = `${basename}-${ID}.${ext}`;
    } else {
        newFname = `${basename}.${ext}`;
    }

    const plugin = thisPlugin();
    await plugin.saveBlob(newFname, file, `data/assets/user/${prefix}`);

    prefix = prefix ? `${prefix}/` : '';
    const route = `assets/user/${prefix}${newFname}`;

    return {
        ok: true,
        name: basename + '.' + ext,
        route: route
    };
}


// ============ 配置管理（完全不变）============

let PredefinedExt = ['docx', 'xlsx', 'pptx', 'md', 'json', 'drawio', 'prg', 'js'];
let PredefinedPaths = ['Markdown', 'Office', 'Chart'];


const SHOULD_USE_BLANK_FILE = ['docx', 'xlsx', 'pptx', 'prg'];


export let name = 'AssetFile';
export let enabled = false;

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: name,
    title: "新建附件文件",
    load: (itemValues: any) => {
        if (itemValues.predefinedPaths) {
            PredefinedPaths = itemValues.predefinedPaths.split(',').map(path => path.trim());
        }
        if (itemValues.predefinedExt) {
            PredefinedExt = itemValues.predefinedExt.split(',').map(ext => ext.trim());
            if (PredefinedExt.includes('')) {
                PredefinedExt = PredefinedExt.filter(ext => ext !== '');
            }
        }
    },
    dump: () => {
        return {
            predefinedPaths: PredefinedPaths.join(', '),
            predefinedExt: PredefinedExt.join(', ')
        }
    },
    items: [
        {
            key: 'predefinedPaths',
            type: 'textinput' as const,
            title: '预定义路径',
            description: `
                使用逗号分隔的路径，例如：<br/>
                <code>Markdown, OfficeDocs</code>
            `,
            direction: 'row',
            get: () => PredefinedPaths.join(', '),
            set: (value: string) => {
                PredefinedPaths = value.split(',').map(path => path.trim());
            }
        },
        {
            key: 'predefinedExt',
            type: 'textinput' as const,
            title: '预定义扩展名',
            description: `
                使用逗号分隔的扩展名，例如：<br/>
                <code>md, txt</code>
            `,
            direction: 'row',
            get: () => PredefinedExt.join(', '),
            set: (value: string) => {
                PredefinedExt = value.split(',').map(ext => ext.trim());
            }
        },
        {
            key: 'uploadBlank',
            type: 'button' as const,
            title: '上传空白模板文件',
            description: `
                上传的文件会被存放到 <code>public/blank-files/</code> 目录下作为 blank-template.<ext> 模板文件使用。
            `,
            direction: 'row',
            get: () => {

            },
            set: (value: string) => {

            },
            button: {
                label: '上传文件',
                callback: () => {
                    openIframeDialog({
                        title: '上传空白模板文件',
                        iframeConfig: {
                            type: 'url',
                            source: '/plugins/sy-f-misc/pages/upload-blank-file.html',
                            inject: {
                                presetSdk: true,
                                siyuanCss: true,
                                customSdk: {
                                    uploadBlankFile: async (ext: string, file: File): Promise<ResultData<null, string>> => {
                                        const result = await siyuanVfs.writeFile(siyuanVfs.join(BLANK_FILE_DIR, `blank-template.${ext}`), file);
                                        return result.ok ? ok(null) : err(result.error || '保存失败');
                                    },
                                    listBlankFiles: async (): Promise<ResultData<string[], string>> => {
                                        const result = await siyuanVfs.readdir(BLANK_FILE_DIR);
                                        if (!result.ok) {
                                            return err('无法读取 blank-files 目录');
                                        }
                                        const item = result.items.map(i => i.name);
                                        return ok(item);
                                    }
                                }
                            },
                        },
                        width: '700px',
                        height: '550px'
                    })
                }
            }
        },
    ],
    help: () => {
        documentDialog({
            sourceUrl: '{{docs}}/asset-file-help.md'
        });
    }
};

// ============ 模块加载 ============

const HTML = `
<div class="b3-list-item__first">
    <svg class="b3-list-item__graphic"><use xlink:href="#iconAdd"></use></svg>
    <span class="b3-list-item__text">新建空白附件</span>
</div>
`;

let disposers = [];

/**
 * 打开附件管理对话框
 * @param protyle 编辑器实例
 * @param initialState 初始状态（可选）
 */
const openAssetDialog = (protyle: Protyle, initialState?: { tab?: 'create' | 'rename'; assetPath?: string }) => {
    // let iframe: HTMLIFrameElement = null;

    const dialog = openIframeDialog({
        title: '附件管理',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/new-file-app.html' + (initialState?.assetPath ? `?tab=rename&asset=${encodeURIComponent(initialState.assetPath)}` : ''),
            inject: {
                presetSdk: true,
                siyuanCss: true,  // ✅ 注入思源 CSS
                customSdk: {
                    // 初始状态
                    initialState: initialState,

                    // 获取配置
                    getConfig: () => ({
                        paths: PredefinedPaths,
                        exts: PredefinedExt
                    }),

                    // 创建文件
                    createFile: addNewEmptyFile,

                    // 插入资源文件到编辑器
                    insertAssetFile: async (route: string, name: string): Promise<boolean> => {
                        try {
                            protyle.insert(`<span data-type="a" data-href="${route}">${name}</span>`, false, true);
                            showMessage(`文件 ${name} 已插入`, 2000, 'info');
                            setTimeout(() => {
                                dialog.close();
                            }, 500);
                            return true;
                        } catch (error) {
                            console.error('插入文件失败:', error);
                            return false;
                        }
                    },

                    // 查找引用块
                    // findAssetBlocks: findAssetBlocks,

                    // // 重命名资源
                    // renameAsset: renameAsset
                }
            },
        },
        width: '700px',
        height: '550px'
    });
};

const openNewSvgDialog = (protyle: Protyle) => {
    inputDialog({
        title: '新建 SVG 图片',
        defaultText: '',
        type: 'textarea',
        width: '800px',
        height: '600px',
        maxWidth: '90%',
        maxHeight: '90%',
        confirm: async (text) => {
            const doc = new DOMParser().parseFromString(text.trim(), 'image/svg+xml');
            const svg = doc.documentElement;
            const svgNamespace = 'http://www.w3.org/2000/svg';
            if (doc.querySelector('parsererror') || svg.localName !== 'svg'
                || (svg.namespaceURI && svg.namespaceURI !== svgNamespace)) {
                showMessage('请输入有效的 SVG 代码（根元素必须为 <svg>）', 5000, 'error');
                return;
            }

            // 从 HTML 复制的 SVG 可能没有 xmlns；独立图片文件需要 SVG 命名空间。
            if (!svg.namespaceURI) {
                svg.setAttribute('xmlns', svgNamespace);
            }
            const content = new XMLSerializer().serializeToString(svg);
            const filename = `svg-${window.Lute.NewNodeID()}.svg`;
            const route = `assets/user/${filename}`;
            try {
                await thisPlugin().saveBlob(filename, new Blob([content], { type: 'image/svg+xml' }), 'data/assets');
            } catch (error) {
                console.error('保存 SVG 失败:', error);
                showMessage('保存 SVG 失败，请重试', 5000, 'error');
                return;
            }

            try {
                protyle.insert(`<img src="${route}" alt="SVG">`, false, true);
            } catch (error) {
                console.error('插入 SVG 图片失败:', error);
                showMessage(`SVG 已保存，但插入失败：${route}`, 10000, 'error');
            }
        }
    });
};

const openAssetDashboard = (loadingEvents?: Record<string, any>) => {
    const vfs = new LocalDiskVFS();
    const handler = {};
    if (vfs.isAvailable()) {
        handler['getFileSize'] = async (path: string) => {

            let target = vfs.join(vfs.SIYUAN_DISK_PATH.WORKSPACE, path);

            const exists = await vfs.exists(target)
            if (!exists) return {
                ok: false, size: null
            };
            const stat = await vfs.stat(target);
            return {
                ok: true,
                size: stat.size
            };
        }
    }
    const dashboard = openIframeTab({
        tabId: 'asset-file-dashboard' + window.Lute.NewNodeID(),
        title: '附件管理',
        icon: 'iconFiles',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/asset-file-dashboard.html',
            inject: {
                presetSdk: true,
                siyuanCss: true,
                customSdk: handler
            },
            onLoadEvents: loadingEvents
        }
    });
    return dashboard;
}

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;

    siyuanVfs.mkdir(BLANK_FILE_DIR); // 确保空白文件目录存在

    // try {
    //     const INDEX_FILE = '/public/blank-files/index.json';
    //     fetch(INDEX_FILE).then(async (res) => {
    //         if (!res.ok) {
    //             return;
    //         }
    //         USE_DEFINED_FILES = await res.json();
    //     });
    // } catch (error) {
    //     console.warn('加载预定义空白文件索引失败', error);
    // }

    // 注册顶部菜单
    plugin.registerMenuTopMenu('asset-file', [
        {
            type: 'submenu',
            label: '附件管理',
            icon: 'iconCamera',
            submenu: [
                {
                    label: '附件管理 Dashboard',
                    icon: 'iconGallery',
                    click: () => {
                        // 不延迟 menu 会无法自动关闭
                        // 怀疑是 mouse 进入 iframe 区域导致鼠标事件无法 bubble 回去
                        // 把任务放到下一个事件循环似乎可以解决
                        setTimeout(() => {
                            openAssetDashboard();
                        });
                    }
                },
                {
                    label: '图片标注',
                    icon: 'iconImage',
                    click: () => {
                        setTimeout(() => {
                            openImageAnnotator();
                        });
                    },
                },
            ]
        },
    ]);

    const dispose1 = thisPlugin().registerEventbusHandler('open-menu-link', (detail) => {
        let menu = detail.menu;
        // let protyle = detail.protyle;
        const hrefSpan = detail.element;

        // let text = hrefSpan.innerText;
        let href = hrefSpan.getAttribute("data-href");
        if (!href?.startsWith("assets/") && !href?.startsWith("/assets/")) {
            return;
        }
        const filename = href.split('/').pop() || '';
        addEditAssetMenu(menu, href);
        // console.log(hrefSpan);
        menu.addItem({
            icon: "iconImage",
            label: '在管理面板中打开',
            click: async () => {
                setTimeout(() => {
                    const dashboard = openAssetDashboard();
                    setTimeout(() => {
                        dashboard.dispatchEvent('search-given-asset-file', { filename: filename });
                    }, 500);
                });
            }
        });

    });

    const dispose2 = thisPlugin().registerEventbusHandler('open-menu-image', (detail) => {
        const element: HTMLSpanElement = detail.element;
        const img = element.querySelector('img');
        let src = img?.getAttribute('src');
        if (!src) {
            return;
        }
        const filename = src.split('/').pop() || '';
        const menu = detail.menu;
        addEditAssetMenu(menu, src);
        menu.addItem({
            label: '本地图片路径',
            icon: 'iconCopy',
            click: () => {
                // .replace('/', '\\');
                const fileEndpoint = src;
                const dataDir = window.siyuan.config.system.dataDir;
                const path = dataDir + '/' + fileEndpoint;
                navigator.clipboard.writeText(path).then(() => {
                    showMessage(`复制到剪贴板: ${path}`);
                });
            }
        });
        menu.addItem({
            label: '在管理面板中打开',
            icon: 'iconImage',
            click: () => {
                setTimeout(() => {
                    const dashboard = openAssetDashboard();
                    setTimeout(() => {
                        dashboard.dispatchEvent('search-given-asset-file', { filename: filename });
                    }, 500);
                });
            }
        });
        menu.addItem({
            label: '标注图片',
            icon: 'iconImage',
            click: () => {
                setTimeout(() => {
                    setTimeout(() => {
                        openImageAnnotator(src, 'right');
                    });
                });
            }
        });
    })

    disposers.push(dispose1);
    disposers.push(dispose2);
    enabled = true;

    // 斜杠命令
    const slash = {
        filter: ['ni', '新建', 'new'],
        html: HTML,
        id: 'new-file',
        callback: async (protyle: Protyle) => {
            openAssetDialog(protyle, {
                tab: 'create'
            });
        }
    };
    plugin.addProtyleSlash(slash);
    plugin.addProtyleSlash({
        filter: ['new-svg', 'svg', '新建SVG'],
        html: '<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#iconImage"></use></svg><span class="b3-list-item__text">新建 SVG 图片</span></div>',
        id: 'new-svg',
        callback: (protyle: Protyle) => openNewSvgDialog(protyle)
    });

    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;

    for (const dispose of disposers) {
        dispose();
    }
    disposers = [];
    plugin.delProtyleSlash('new-file');
    plugin.delProtyleSlash('new-svg');
    plugin.unRegisterMenuTopMenu('asset-file');
    enabled = false;
}

