/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-17 12:00:18
 * @FilePath     : /src/func/post-doc/core.ts
 * @LastEditTime : 2024-12-19 14:45:31
 * @Description  : 
 */
import { getBlockByID, listDocTree } from "@/api";
import { simpleDialog } from "@frostime/siyuan-plugin-kits";


export const request = async (host: string, port: number, token: string, endpoint: string, payload?: any, type: 'json' | 'form' = 'json') => {
    const url = `http://${host}:${port}${endpoint}`;
    const headers: any = {
        Authorization: `Token ${token}`
    };

    // 如果是表单数据，不设置 'Content-Type'，浏览器会自动设置
    if (type === 'json') {
        headers['Content-Type'] = 'application/json';
    }

    let body = type === 'json' ? JSON.stringify(payload) : payload;
    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: body
    });

    if (!response.ok) {
        return null;
    }

    return response.json();
}

/**
 * getFile 会擅自改变获取数据的类型，这里自定义一个 getFile
 * @param endpoint 
 * @returns 
 */
const fetchFile = async (path: string): Promise<Blob | null> => {
    const endpoint = '/api/file/getFile'
    let response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
            path: path
        })
    });
    if (!response.ok) {
        return null;
    }
    let data = await response.blob();
    return data;
}


const createForm = (path: string, isDir: boolean, file: Blob | any, stream?: boolean) => {
    let form = new FormData();
    form.append('path', path);
    form.append('isDir', isDir.toString());
    form.append('modTime', Math.floor(Date.now() / 1000).toString());
    if (file instanceof Blob && !stream) {
        form.append('file', file);
    } else {
        form.append('file', new Blob([file], { type: 'application/octet-stream' }));
    }

    return form;
}


/**
 * 获取思源文档 sy 文件
 * @param docId 
 * @returns sy: { file: Blob; assets: string[]; }
 */
const getSyFile = async (docId: DocumentId) => {
    let block = await getBlockByID(docId);
    let { path, box } = block;
    const syPath = `/data/${box}${path}`;

    let syblob: Blob = await fetchFile(syPath);
    let syfileContent: string = await syblob.text();

    const assetPattern = /"assets\/[^"]+"/g;
    let matches = [...syfileContent.matchAll(assetPattern)];
    let assetsLinks = matches.map(match => match[0].slice(1, -1));

    return { file: syblob, assets: assetsLinks };
}

export const checkConnection = async (host: string, port: number, token: string) => {
    let data = await request(host, port, token, '/api/query/sql', {
        fmt: "select * from blocks limit 1"
    });
    if (data === null) {
        return false;
    }
    return true;
}


const strsize = (bytes: number) => {
    let kb = bytes / 1024;
    if (kb < 1024) {
        return `${kb.toFixed(2).padStart(6)} KB`;
    } else {
        let mb = kb / 1024;
        if (mb < 1024) {
            return `${mb.toFixed(2).padStart(6)} MB`;
        } else {
            let gb = mb / 1024;
            return `${gb.toFixed(2).padStart(6)} GB`;
        }
    }
}


const showLog = () => {
    const textarea = document.createElement('textarea');
    Object.assign(textarea.style, {
        flex: '1',
        fontSize: '16px',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        resize: 'none',
    });
    //不允许用户编辑
    textarea.readOnly = true;
    simpleDialog({
        title: '上传中...',
        ele: textarea,
        width: '1000px',
        height: '500px'
    });
    return (...texts: string[]) => {
        let newline = new Date().toLocaleString() + '| ' + texts.join(' ');
        textarea.value += `${newline}\n`;
    }
}


const checkTarget = () => {

}


export const post = async (props: IPostProps) => {
    const { host, port, token, box, dir } = props.target;

    const log = showLog();

    // Create a Set to store the uploaded assets
    const uploadedAssets = new Set<string>();

    const uploadSingleDoc = async (docId: DocumentId, parentDir: string) => {
        log(`=============== 开始上传文档 ${docId} ===============`);
        let targetSypath = `${parentDir}${docId}.sy`;
        let { file, assets } = await getSyFile(docId);
        let form = createForm(targetSypath, false, file);
        await request(host, port, token, '/api/file/putFile', form, 'form');
        log(`Post SiYun File:`, targetSypath);

        let uploaders = assets.map(async (asset: string, index: number) => {
            return (async () => {
                // Check if the asset has already been uploaded
                if (uploadedAssets.has(asset)) {
                    log(`Asset File | [${index + 1}/${assets.length}] | Already uploaded`, asset);
                    return;
                }

                let path = `/data/${asset}`;
                let file = await fetchFile(path);
                if (file === null) {
                    log(`Post Asset File | [${index + 1}/${assets.length}] | Failed to read`, asset);
                    return;
                }

                let form = createForm(path, false, file);
                await request(host, port, token, '/api/file/putFile', form, 'form');
                log(`Post Asset File | [${index + 1}/${assets.length}] | [${strsize(file.size)}] |`, asset);

                // Add the asset to the Set of uploaded assets
                uploadedAssets.add(asset);
            })();
        })
        await Promise.all(uploaders);
        log(`文档 ${targetSypath} 及其全部附件上传成功!\n`)
    }

    const traverseTree = async (nodes: IDocTreeNode[], dir: string) => {
        for (let node of nodes) {
            // console.log(dir, node.id);
            await uploadSingleDoc(node.id, dir);
            if (node.children) {
                await traverseTree(node.children, `${dir}${node.id}/`);
            }
        }
    }

    let root = `/data/${box}${dir}`;
    await uploadSingleDoc(props.src.doc, root);
    if (props.src.recursive) {
        let doc = await getBlockByID(props.src.doc);
        let tree: IDocTreeNode[] = await listDocTree(doc.box, doc.path.replace('.sy', ''));
        await traverseTree(tree, `${root}${doc.id}/`);
    }

    //远端服务器重新索引
    await request(host, port, token, '/api/filetree/refreshFiletree', {});
    log('重建索引，全部上传完成!')
    return true;
}

