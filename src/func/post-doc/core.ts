import { getBlockByID, getFile } from "@/api";

/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-17 12:00:18
 * @FilePath     : /src/func/post-doc/core.ts
 * @LastEditTime : 2024-07-17 13:53:40
 * @Description  : 
 */
interface IPost {
    src: {
        doc: DocumentId;
        recursive: boolean;
    }
    target: {
        ip: string;
        port: number;
        token: string;
        box: string;
        path: string;
    }
}

const request = async (ip: string, port: number, token: string, endpoint: string, payload?: any, type: 'json' | 'form' = 'json') => {
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
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
}


const createForm = (path: string, isDir: boolean, file: any) => {
    let form = new FormData();
    form.append('path', path);
    form.append('isDir', isDir.toString());
    form.append('modTime', Math.floor(Date.now() / 1000).toString());
    form.append('file', new Blob([file], { type: 'application/octet-stream' }));

    return form;
}


const getSyFile = async (docId: DocumentId) => {
    let block = await getBlockByID(docId);
    let { path, box } = block;
    let syFile: Object = await getFile(`/data/${box}${path}`, 'text');
    let syfileContent: string = JSON.stringify(syFile);

    const assetPattern = /"assets\/[^"]+"/g;
    let matches = [...syfileContent.matchAll(assetPattern)];
    let assetsLinks = matches.map(match => match[0].slice(1, -1));

    return {file: syfileContent, assets: assetsLinks};
}


export const post = async (props: IPost) => {
    const { ip, port, token } = props.target;

    let { file, assets } = await getSyFile(props.src.doc);

    let form = createForm(props.target.path, false, file);
    await request(ip, port, token, '/api/file/putFile', form, 'form');
    //远端服务器重新索引
    request(ip, port, token, '/api/filetree/refreshFiletree', {});
}
