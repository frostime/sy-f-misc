import { Protyle, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { upload } from "@/api";
import { confirmDialog } from "@/libs/dialog";
import { FormInput } from '@/libs/components/Form';
import { render } from "solid-js/web";

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
        showMessage(`空白文件 ${blankFiles[ext]} 不存在!`, 2500, 'error');
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
 */
const addNewEmptyFile = async (fname: string) => {
    let file: File | null = null;
    const ext = fname.split('.').pop() || '';
    if (['docx', 'xlsx', 'pptx'].includes(ext)) {
        file = await useBlankFile(fname);
    } else {
        file = createEmptyFileObject(fname);
    }
    if (!file) return null;
    const res = await upload('/assets/', [file]);
    // console.log(res, res.succMap[fname]);
    return res.succMap;
}

const PredefinedExt = ['docx', 'xlsx', 'pptx', 'md', 'json', 'drawio', 'js'];

const NewFileApp = (props: { updated: (v) => void }) => {

    let fname = '';
    let ext = '';

    let options: { [key: string]: string } = PredefinedExt.reduce((acc, ext) => {
        acc[`.${ext}`] = `.${ext}`;
        return acc;
    }, {} as { [key: string]: string });

    return (
        <div class="fn__flex" style="gap: 5px;">
            <div class="fn__flex">
                <FormInput
                    type='textinput'
                    key='fname'
                    value=''
                    changed={(v) => {
                        fname = v;
                        props.updated(fname + ext);
                    }}
                />
            </div>
            <div class="fn__flex fn__flex-1">
                <FormInput
                    type='select'
                    key='ext'
                    value=''
                    fn_size={false}
                    options={{
                        '': '自定义',
                        ...options
                    }}
                    changed={(v) => {
                        ext = v;
                        props.updated(fname + ext);
                    }}
                />
            </div>
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

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;

    const slash = {
        filter: ['ni', '新建', 'new'],
        html: HTML,
        id: 'new-file',
        callback: async (protyle: Protyle) => {
            let fname: string = '';

            const createCb = async () => {
                let succMap = await addNewEmptyFile(fname);
                let filePath = succMap?.[fname];
                if (filePath) {
                    showMessage(`新建文件${fname}成功, 文件路径: ${filePath}`);
                    protyle.insert(`<span data-type="a" data-href="${filePath}">${fname}</span>`, false, true);
                } else {
                    showMessage(`新建文件${fname}失败`);
                    protyle.insert(``, false);
                }
            };
            let ele = document.createElement('div');
            render(() => NewFileApp({
                updated: (v) => { fname = v; }
            }), ele);

            confirmDialog({
                title: '新建空白附件',
                content: ele,
                confirm: createCb
            });
        }
    };
    plugin.addProtyleSlash(slash);
    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;

    plugin.delProtyleSlash('new-file');
    enabled = false;
}
