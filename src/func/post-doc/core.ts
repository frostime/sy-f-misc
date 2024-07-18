/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-17 12:00:18
 * @FilePath     : /src/func/post-doc/core.ts
 * @LastEditTime : 2024-07-17 22:05:09
 * @Description  : 
 */
import { getBlockByID } from "@/api";
import { showMessage } from "siyuan";


export const request = async (ip: string, port: number, token: string, endpoint: string, payload?: any, type: 'json' | 'form' = 'json') => {
    const url = `http://${ip}:${port}${endpoint}`;
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

export const checkConnection = async (ip: string, port: number, token: string) => {
    let data = await request(ip, port, token, '/api/system/version', null);
    if (data === null) {
        showMessage(`无法连接到 ${ip}:${port}`, 5000, 'error');
        return false;
    }
    return true;
}

export const post = async (props: IPostProps) => {
    const { ip, port, token } = props.target;

    let { file, assets } = await getSyFile(props.src.doc);

    let form = createForm(props.target.path, false, file);
    await request(ip, port, token, '/api/file/putFile', form, 'form');

    let uploaders = assets.map(async (asset: string, index: number) => {
        return (async () => {
            let file = await fetchFile(asset);
            if (file === null) {
                console.log(`[${index + 1}/${assets.length}] Assets: Failed to read`, asset);
                return;
            }
            let form = createForm(`/data/${asset}`, false, file);
            console.log(`[${index + 1}/${assets.length}] Assets:`, asset);
            await request(ip, port, token, '/api/file/putFile', form, 'form');
        })();
    })
    await Promise.all(uploaders);

    //远端服务器重新索引
    await request(ip, port, token, '/api/filetree/refreshFiletree', {});
    return true;
}
