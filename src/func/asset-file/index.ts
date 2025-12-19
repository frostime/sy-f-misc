import { Protyle, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { confirmDialog, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { openIframDialog } from "@/func/html-pages/core";

export const declareToggleEnabled = {
    title: '📄 附件文件',
    description: '创建空白附件文件, 查看所有附件等...',
    defaultEnabled: true
};

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

let USE_DEFINED_FILES = {};

const useBlankFile = async (fname: string): Promise<File | null> => {
    const blankFiles = {
        'docx': `/public/blank-files/blank-word.docx`,
        'xlsx': `/public/blank-files/blank-excel.xlsx`,
        'pptx': `/public/blank-files/blank-ppt.pptx`,
        'prg': `/public/blank-files/blank-prg.prg`,
        ...USE_DEFINED_FILES
    };
    const ext = fname.split('.').pop() || '';
    if (!blankFiles[ext]) return null;

    const res = await fetch(blankFiles[ext]);
    if (!res.ok) {
        console.warn(`空白文件 ${blankFiles[ext]} 不存在!`);
        confirmDialog({
            title: `空白文件 ${blankFiles[ext]} 不存在!`,
            content: `⚠️ 注意，如果你想要创建一个空白的 Office 文件，
            你首先需要在 <工作空间>/data/public/blank-files/ 目录下创建对应的空白模板文件 blank-word.docx, blank-excel.xlsx, blank-ppt.pptx`
        })
        return null;
    }
    const blob = await res.blob();
    const file = new File([blob], fname, {
        type: mimeTypes[ext],
        lastModified: Date.now()
    });
    return file;
}

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
    if (['docx', 'xlsx', 'pptx'].includes(ext)) {
        file = await useBlankFile(name);
    } else {
        file = createEmptyFileObject(name);
    }
    if (!file) return null;

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
        name: basename + '.' + ext,
        route: route
    };
}


// ============ 配置管理（完全不变）============

let PredefinedExt = ['docx', 'xlsx', 'pptx', 'md', 'json', 'drawio', 'prg', 'js', ...(Object.keys(USE_DEFINED_FILES))];
let PredefinedPaths = ['Markdown', 'Office', 'Chart'];

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "new-file",
    title: "新建文件",
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
        }
    ],
};

// ============ 模块加载 ============

export let name = 'AssetFile';
export let enabled = false;

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

    const dialog = openIframDialog({
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

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;

    try {
        const INDEX_FILE = '/public/blank-files/index.json';
        fetch(INDEX_FILE).then(async (res) => {
            if (!res.ok) {
                return;
            }
            USE_DEFINED_FILES = await res.json();
        });
    } catch (error) {
        console.warn('加载预定义空白文件索引失败', error);
    }

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

    // 右键菜单 - 更改 Asset
    // 发现思源支持重命名附件，那就干脆不要这个功能算了
    // const dispose = thisPlugin().registerEventbusHandler('open-menu-link', (detail) => {
    //     let menu = detail.menu;
    //     const hrefSpan = detail.element;

    //     let href = hrefSpan.getAttribute("data-href");
    //     if (!href?.startsWith("assets/") && !href?.startsWith("/assets/")) {
    //         return;
    //     }

    //     menu.addItem({
    //         icon: "iconImage",
    //         label: '更改 Asset',
    //         click: async () => {
    //             // 获取当前的 protyle 实例
    //             const protyle = detail.protyle;

    //             // 打开对话框并导航到重命名 tab
    //             openAssetDialog(
    //                 { protyle: protyle, insert: () => { } } as unknown as Protyle,
    //                 {
    //                     tab: 'rename',
    //                     assetPath: href
    //                 });
    //         }
    //     });
    // });
    // disposers.push(dispose);

    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;

    for (const dispose of disposers) {
        dispose();
    }
    disposers = [];
    plugin.delProtyleSlash('new-file');
    enabled = false;
}

