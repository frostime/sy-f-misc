import { Plugin, Protyle, showMessage } from "siyuan";
import { upload } from "@/api";
import { inputDialog } from "@/utils/dialog";

const createEmptyFileObject = (fname: string): File => {
    // A basic MIME type mapping based on file extension
    const mimeTypes: { [key: string]: string } = {
        'txt': 'text/plain',
        'md': 'text/plain',
        'drawio': 'application/vnd.jgraph.mxfile',
        'csv': 'text/csv',
        'json': 'application/json',
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

    // Extract the file extension from the filename
    const ext = fname.split('.').pop() || '';
    // Lookup the MIME type; default to 'application/octet-stream' if the extension is unknown
    const mimeType = mimeTypes[ext.toLowerCase()] || 'text/plain';

    // Create an empty Blob with the detected MIME type
    const emptyBlob = new Blob([], { type: mimeType });
    // Create the File object with the blob, filename, and MIME type
    const emptyFile = new File([emptyBlob], fname, {
        type: mimeType,
        lastModified: Date.now()
    });

    return emptyFile;
};


/**
 * 新建空白的文件, 上传到思源的附件中
 * @param fname 文件名称
 */
const addNewEmptyFile = async (fname: string) => {
    const file = createEmptyFileObject(fname);
    const res = await upload('/assets/', [file]);
    // console.log(res, res.succMap[fname]);
    return res.succMap;
}


export const load = (plugin: Plugin) => {
    const slash = {
        filter: ['ni', '新建', 'new'],
        html: '新建空白附件',
        id: 'new-file',
        callback: async (protyle: Protyle) => {
            inputDialog('新建空白附件', '输入文件名称', '', async (fname: string) => {
                let succMap = await addNewEmptyFile(fname);
                let filePath = succMap?.[fname];
                if (filePath) {
                    showMessage(`新建文件${fname}成功, 文件路径: ${filePath}`);
                    protyle.insert(`<span data-type="a" data-href="${filePath}">${fname}</span>`, false, true);
                } else {
                    showMessage(`新建文件${fname}失败`);
                    protyle.insert(``, false);
                }
            });
        }
    };
    plugin.protyleSlash.push(slash);
}

export const unload = (plugin: Plugin) => {
    plugin.protyleSlash = plugin.protyleSlash.filter(slash => slash.id !== 'new-file');
}
