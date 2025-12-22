import { siyuanVfs } from "@/libs/vfs/vfs-siyuan-adapter";
import { openIframeTab } from "../html-pages/core";
import { showMessage } from "siyuan";

export const openImageAnnotator = (sourcePath?: string, position?: 'right' | 'bottom' | null) => {
    const handler = {};

    // let blobCache: Blob | null = null;

    if (sourcePath && (sourcePath.startsWith('assets/') || sourcePath.startsWith('/assets/'))) {
        sourcePath = siyuanVfs.join('/data/', sourcePath);
        const ext = siyuanVfs.extname(sourcePath);
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext.toLowerCase())) {
            showMessage('仅支持 PNG、JPG、WEBP 等图片文件进行标注', 500, 'error');
            return;
        }

        handler['imageSource'] = {
            get: async () => {
                const result = await siyuanVfs.readFile(sourcePath, 'blob');
                // return result.ok ? result.data : new Blob();
                if (result.ok) {
                    // blobCache = result.data;
                    // return blobCache;
                    const blob = result.data;
                    return blob;
                } else {
                    return new Blob();
                }
            },
            overwrite: async (data: Blob) => {
                // const result = await siyuanVfs.writeFile(sourcePath!, blobCache);
                const result = await siyuanVfs.writeFile(sourcePath!, data);
                return result;
            }
        }
    }
    const dashboard = openIframeTab({
        tabId: 'asset-file-dashboard' + window.Lute.NewNodeID(),
        title: '图片标注',
        icon: 'iconImage',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/image-annotator.html',
            inject: {
                presetSdk: true,
                siyuanCss: true,
                customSdk: handler
            }
        },
        position: position,
    });
    return dashboard;
}
