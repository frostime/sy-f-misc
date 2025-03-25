import { Protyle, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
// import { upload } from "@/api";
import { confirmDialog, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { render } from "solid-js/web";
import { For, onMount, Show } from "solid-js";
import { CheckboxInput, SelectInput, TextInput } from "@/libs/components/Elements";
import { createSignalRef } from "@frostime/solid-signal-ref";
import { sql } from "@frostime/siyuan-plugin-kits/api";
import { solidDialog } from "@/libs/dialog";
import Markdown from "@/libs/components/Elements/Markdown";
import { request } from "@/api";

export const declareToggleEnabled = {
    title: '📄 New file',
    description: '新建空白附件',
    defaultEnabled: true
};
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
    // A basic MIME type mapping based on file extension

    // Extract the file extension from the filename
    const ext = fname.split('.').pop() || '';
    // Lookup the MIME type; default to 'application/octet-stream' if the extension is unknown
    const mimeType = mimeTypes[ext.toLowerCase()] || 'text/plain';

    //填充空白文件内容
    let content = BlankFileContent?.[ext];

    let blobParts = content ? [content] : [];

    // Create an empty Blob with the detected MIME type
    const emptyBlob = new Blob(blobParts, { type: mimeType });
    // Create the File object with the blob, filename, and MIME type
    const emptyFile = new File([emptyBlob], fname, {
        type: mimeType,
        lastModified: Date.now()
    });

    return emptyFile;
};


const useBlankFile = async (fname: string): Promise<File | null> => {
    const blankFiles = {
        'docx': `/public/blank-files/blank-word.docx`,
        'xlsx': `/public/blank-files/blank-excel.xlsx`,
        'pptx': `/public/blank-files/blank-ppt.pptx`,
    }
    const ext = fname.split('.').pop() || '';
    if (!blankFiles[ext]) return null;

    const res = await fetch(blankFiles[ext]);
    // 如果文件不存在
    if (!res.ok) {
        console.warn(`空白文件 ${blankFiles[ext]} 不存在!`);
        // showMessage(`空白文件 ${blankFiles[ext]} 不存在!`, 2500, 'error');
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
 * @param fname 文件名称
 * @param addId 是否添加ID到文件名，默认为true
 */
const addNewEmptyFile = async (fname: string, addId: boolean = true) => {
    let prefix = '';
    let name = '';
    if (fname.includes('/')) {
        [prefix, name] = fname.split('/');
    } else {
        name = fname;
    }

    let basename = name.split('.').slice(0, -1).join('.');
    let ext = name.split('.').pop() || '';

    let file: File | null = null;
    if (['docx', 'xlsx', 'pptx'].includes(ext)) {
        file = await useBlankFile(fname);
    } else {
        file = createEmptyFileObject(fname);
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

let PredefinedExt = ['docx', 'xlsx', 'pptx', 'md', 'json', 'drawio', 'js'];

let PredefinedPaths = ['Markdown', 'Office'];

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

const NewFileApp = (props: { updated: (v) => void }) => {
    let fname = '';
    let ext = PredefinedExt.includes('md') ? '.md' : PredefinedExt[0];
    // let prefix = '';
    let prefix = createSignalRef('');

    let addId = true;

    let options: { [key: string]: string } = PredefinedExt.reduce((acc, ext) => {
        acc[`.${ext}`] = `.${ext}`;
        return acc;
    }, {} as { [key: string]: string });

    let ref: HTMLTableCellElement;

    onMount(() => {
        const input = ref?.querySelector('input');
        if (input) {
            setTimeout(() => {
                input.focus();
            }, 100);
        }
    });

    const prefixMap = PredefinedPaths.reduce((acc, path) => {
        acc[path] = path;
        return acc;
    }, {} as { [key: string]: string });
    prefixMap[''] = '';
    const updateFullPath = () => {
        const cleanPrefix = prefix().replace(/^\/+|\/+$/g, ''); // Fixed the regex syntax
        const path = cleanPrefix ? `${cleanPrefix}/` : '';
        props.updated({
            path: path + fname + ext,
            addId: addId
        });
    };

    return (
        <div class="fn__flex-column" style="gap: 8px;">
            <table class="b3-table" style="width: 100%; border-spacing: 0; border-collapse: collapse;">
                <tbody>
                    <tr>
                        <td style="text-align: left; padding: 8px 4px;">
                            <span>添加 ID 到文件名</span>
                        </td>
                        <td style="text-align: right; padding: 8px 4px;">
                            <CheckboxInput
                                checked={addId}
                                changed={(v) => {
                                    addId = v;
                                    updateFullPath();
                                }}
                            />
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 4px;">
                            <TextInput
                                value={prefix()}
                                changed={(v) => {
                                    prefix.update(v);
                                    updateFullPath();
                                }}
                                placeholder='自定义路径前缀'
                                style={{ width: '100%' }}
                            />
                        </td>
                        <td style="padding: 8px 4px;">
                            <SelectInput
                                value={''}
                                changed={(v) => {
                                    prefix.update(v);
                                    updateFullPath();
                                }}
                                options={prefixMap}
                                style={{ width: '100%' }}
                            />
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 4px;" ref={ref}>
                            <TextInput
                                value={fname}
                                changed={(v) => {
                                    fname = v;
                                    updateFullPath();
                                }}
                                placeholder='文件名'
                                style={{ width: '100%' }}
                            />
                        </td>
                        <td style="padding: 8px 4px;">
                            <SelectInput
                                value={ext}
                                changed={(v) => {
                                    ext = v;
                                    updateFullPath();
                                }}
                                options={{
                                    '': '自定义',
                                    ...options
                                }}
                                style={{ width: '100%' }}
                            />
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

/**
 * TODO
 * 
 * @ui
 * - 按钮组，一行，靠右
 *  - 查找指定附件的块
 *  - 确认批量重命名
 * - Form
 *  - Row 1
 *      - 原始文件名
 *      - textline, 不可编辑
 *  - Row 2
 *      - 新文件名
 *      - textline, 可编辑
 * - 查找到的块的列表
 *  - Item
 *      - checkbox, 默认选中
 *      - 显示块的 markdown 属性
 */
const RenameAssetFile = (props: { assetLink: string }) => {
    /**
     * 查找使用了指定附件链接的块
     * @param assetLink 
     * @returns 
     */
    const findAssetBlock = async (assetLink: string): Promise<Block[]> => {
        let blocks = await sql(`
        select * from blocks where (type='p' or type='h')
        and (markdown like '%[%](${assetLink})%' or markdown like '%[%](${assetLink} "%")%')
    `);
        return blocks;
    }

    /**
     * 移动资源文件
     * 注意：这个函数是一个占位符，实际实现需要由用户完成
     */
    const moveAssetFile = async (source: string, destination: string): Promise<boolean> => {
        //略, 由用户来实现
        // console.log(`Moving asset from ${source} to ${destination}`);
        if (source.startsWith('/assets')) {
            source = source.slice(1);
        }
        if (destination.startsWith('/assets')) {
            destination = destination.slice(1);
        }

        const results = await request('/api/file/renameFile', {
            path: '/data/' + source,
            newPath: '/data/' + destination
        }, 'response');
        if (results.code !== 0) {
            showMessage('移动失败' + results.msg, 3000, 'error');
            return false;
        }
        return true;
    }

    /**
     * 编辑块中的资源链接
     * 注意：这个函数是一个占位符，实际实现需要由用户完成
     */
    const editBlocks = async (blockList: Block[], assetLink: {
        old: string;
        new: string;
    }): Promise<{ success: boolean; result: Record<string, boolean> }> => {
        const result: Record<string, boolean> = {};
        try {
            // 处理可能的斜杠前缀
            const oldLink = assetLink.old.startsWith('/') ? assetLink.old.slice(1) : assetLink.old;
            const newLink = assetLink.new.startsWith('/') ? assetLink.new.slice(1) : assetLink.new;

            // 转义特殊字符，以便在正则表达式中使用
            const escapedOldLink = oldLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // 创建正则表达式匹配三种情况：
            // 1. [](link)
            // 2. [title](link)
            // 3. [title](link "可选的文本")
            const regex = new RegExp(`(\\[([^\\]]*)\\]\\()${escapedOldLink}((?:\\s+"[^"]*")?\\))`, 'g');

            for (const block of blockList) {
                // 替换 markdown 中的链接
                const newMarkdown = block.markdown.replace(regex, (match, prefix, title, suffix) => {
                    return `${prefix}${newLink}${suffix}`;
                });

                // 如果内容有变化，更新块
                if (newMarkdown !== block.markdown) {
                    const updateResult = await request('/api/block/updateBlock', {
                        id: block.id,
                        data: newMarkdown,
                        dataType: 'markdown'
                    }, 'response');

                    if (updateResult.code !== 0) {
                        console.warn(`Failed to update block ${block.id}:`, updateResult.msg);
                        result[block.id] = false;
                    } else {
                        result[block.id] = true;
                    }
                }
            }
        } catch (error) {
            console.error('Error updating blocks:', error);
        }
        return {
            result,
            success: Object.values(result).every(v => v)
        };
    }

    /**
     * 检查是否为有效的asset链接名
     * @param name 
     * @returns 
     */
    const checkIfValidAssetlinkName = (name: string): boolean => {
        if (!name.startsWith('assets/')) return false;
        return true;
    }

    // Create signals for component state
    const originalAssetLink = createSignalRef(props.assetLink);
    const newAssetLink = createSignalRef(props.assetLink);
    const blocks = createSignalRef<Block[]>([]);
    const selectedBlocks = createSignalRef<Record<string, boolean>>({});
    const isSearching = createSignalRef(false);
    const isRenaming = createSignalRef(false);

    // Handle search for blocks using the asset
    const handleSearch = async () => {
        isSearching.value = true;
        try {
            const foundBlocks = await findAssetBlock(originalAssetLink.value);
            blocks.value = foundBlocks;

            // Initialize all blocks as selected
            const selected: Record<string, boolean> = {};
            foundBlocks.forEach(block => {
                selected[block.id] = true;
            });
            selectedBlocks.value = selected;
        } catch (error) {
            console.error('Error searching for blocks:', error);
            showMessage('查找块时出错', 3000, 'error');
        } finally {
            isSearching.value = false;
        }
    };

    // Handle rename asset file and update blocks
    const handleRename = async () => {
        if (originalAssetLink.value === newAssetLink.value) {
            showMessage('新文件名与原文件名相同，无需重命名', 3000, 'info');
            return;
        }

        if (!checkIfValidAssetlinkName(newAssetLink.value)) {
            showMessage('新文件名格式不正确，必须以 assets/ 开头', 3000, 'error');
            return;
        }

        isRenaming.value = true;
        try {
            // Get selected blocks
            const blocksToUpdate = blocks.value.filter(block => selectedBlocks.value[block.id]);

            // Move asset file
            const moveSuccess = await moveAssetFile(originalAssetLink.value, newAssetLink.value);
            if (!moveSuccess) {
                return;
            }

            // Update blocks
            const updateSuccess = await editBlocks(blocksToUpdate, {
                old: originalAssetLink.value,
                new: newAssetLink.value
            });

            if (!updateSuccess.success) {
                showMessage('更新块引用出现问题，建议查看控制台', 3000, 'error');
            } else {
                showMessage('重命名成功', 3000, 'info');
                originalAssetLink.value = newAssetLink.value;
                handleSearch();
            }
        } catch (error) {
            console.error('Error renaming asset:', error);
            showMessage('重命名时出错', 3000, 'error');
        } finally {
            isRenaming.value = false;
        }
    };

    // Toggle block selection
    const toggleBlockSelection = (blockId: string) => {
        const newSelection = { ...selectedBlocks.value };
        newSelection[blockId] = !newSelection[blockId];
        selectedBlocks.value = newSelection;
    };

    // Select/deselect all blocks
    const toggleAllBlocks = (select: boolean) => {
        const newSelection: Record<string, boolean> = {};
        blocks.value.forEach(block => {
            newSelection[block.id] = select;
        });
        selectedBlocks.value = newSelection;
    };

    let container: HTMLDivElement;

    // Expand/collapse all details elements
    const toggleAllDetails = (open: boolean) => {
        const detailsElements = container.querySelectorAll('.b3-card details');
        detailsElements.forEach(detail => {
            if (open) {
                detail.setAttribute('open', '');
            } else {
                detail.removeAttribute('open');
            }
        });
    };

    return (
        <div class="fn__flex-column" style="gap: 12px; padding: 8px 12px; flex: 1; font-size: 16px;"
            ref={container}
        >
            <div class="fn__flex" style="justify-content: flex-end; gap: 8px;">
                <button
                    class="b3-button b3-button--outline"
                    onClick={handleSearch}
                    disabled={isSearching.value}
                >
                    {isSearching.value ? '查找中...' : '查找引用块'}
                </button>
                <button
                    class="b3-button b3-button--text"
                    onClick={handleRename}
                    disabled={isRenaming.value || blocks.value.length === 0}
                >
                    {isRenaming.value ? '重命名中...' : '确认重命名'}
                </button>
            </div>
            <div style="gap: 8px; display: flex; flex-direction: column;">
                <div class="fn__flex" style="align-items: center; gap: 8px;">
                    <label style="min-width: 80px;">原始文件名</label>
                    <div class="fn__flex-1">
                        <TextInput
                            value={originalAssetLink.value}
                            placeholder="原始文件名"
                            spellcheck={false}
                            style={{
                                width: '100%'
                            }}
                            disabled={true}
                        />
                    </div>
                </div>
                <div class="fn__flex" style="align-items: center; gap: 8px;">
                    <label style="min-width: 80px;">新文件名</label>
                    <div class="fn__flex-1">
                        <TextInput
                            value={newAssetLink.value}
                            changed={(value) => newAssetLink.value = value}
                            placeholder="新文件名"
                            spellcheck={false}
                            style={{
                                width: '100%'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Block list */}
            <Show when={blocks.value.length > 0}>
                <div style="gap: 8px; display: flex; flex-direction: column;">
                    <div class="fn__flex" style="justify-content: space-between; align-items: center;">
                        <span class="b3-label">引用块列表 ({blocks.value.length})</span>
                        <div class="fn__flex" style="gap: 8px;">
                            <button
                                class="b3-button b3-button--text b3-button--small"
                                onClick={() => toggleAllBlocks(true)}
                            >
                                全选
                            </button>
                            <button
                                class="b3-button b3-button--text b3-button--small"
                                onClick={() => toggleAllBlocks(false)}
                            >
                                取消全选
                            </button>
                            <button
                                class="b3-button b3-button--text b3-button--small"
                                onClick={() => toggleAllDetails(true)}
                            >
                                全部展开
                            </button>
                            <button
                                class="b3-button b3-button--text b3-button--small"
                                onClick={() => toggleAllDetails(false)}
                            >
                                全部折叠
                            </button>
                        </div>
                    </div>

                    <For each={blocks.value}>
                        {(block) => (
                            <div class="fn__flex b3-card" style="padding: 4px; align-items: center; gap: 8px; margin: 0px;">
                                <CheckboxInput
                                    checked={selectedBlocks.value[block.id] || false}
                                    changed={() => toggleBlockSelection(block.id)}
                                />
                                <details open>
                                    <summary class="popover__block" data-id={block.id}>
                                        {block.hpath}
                                    </summary>
                                    <div onclick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}>
                                        <pre style="font-family: var(--b3-font-family);">{block.markdown}</pre>
                                        <Markdown markdown={block.markdown} />
                                    </div>
                                </details>
                            </div>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
}


export let name = 'NewFile';
export let enabled = false;

const HTML = `
<div class="b3-list-item__first">
    <svg class="b3-list-item__graphic"><use xlink:href="#iconAdd"></use></svg>
    <span class="b3-list-item__text">新建空白附件</span>
</div>
`;

let disposers = [];

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;

    const slash = {
        filter: ['ni', '新建', 'new'],
        html: HTML,
        id: 'new-file',
        callback: async (protyle: Protyle) => {
            let fname: string = '';
            let addId: boolean = true;

            const createCb = async () => {
                let result = await addNewEmptyFile(fname, addId);
                if (result) {
                    const { name, route } = result;
                    showMessage(`新建文件${name}成功, 文件路径: ${route}`);
                    protyle.insert(`<span data-type="a" data-href="${route}">${name}</span>`, false, true);
                } else {
                    showMessage(`新建文件${fname}失败`);
                    protyle.insert(``, false);
                }
            };
            let ele = document.createElement('div');
            render(() => NewFileApp({
                updated: (v) => {
                    fname = v.path;
                    addId = v.addId;
                }
            }), ele);

            confirmDialog({
                title: '新建空白附件',
                content: ele,
                confirm: createCb
            });
        }
    };
    plugin.addProtyleSlash(slash);

    const dispose = thisPlugin().registerEventbusHandler('open-menu-link', (detail) => {
        let menu = detail.menu;
        // let protyle = detail.protyle;
        const hrefSpan = detail.element;

        // let text = hrefSpan.innerText;
        let href = hrefSpan.getAttribute("data-href");
        if (!href?.startsWith("assets/") && !href?.startsWith("/assets/")) {
            return;
        }
        // console.log(hrefSpan);
        menu.addItem({
            icon: "iconImage",
            label: '更改 Asset',
            click: async () => {
                solidDialog({
                    title: '更改 Asset',
                    loader: () => <RenameAssetFile assetLink={href} />,
                    width: '960px',
                    height: '500px'
                });
            }
        });
    });
    disposers.push(dispose);
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
