/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 11:21:28
 * @FilePath     : /src/func/toggl/api/requests.ts
 * @LastEditTime : 2025-01-04 17:20:01
 * @Description  : 
 */
// requests.ts

import { token64 } from '../state/config';

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface RequestOptions {
    method: RequestMethod;
    body?: any;
}

interface ResponseData<T> {
    ok: boolean;
    status: number;
    data: T;
}

const request_ = async <T>(url: string, options: RequestOptions): Promise<ResponseData<T>> => {
    let finalUrl = url;
    const payloads = {
        method: options.method,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${token64()}`
        }
    };

    if (options.method.toLocaleLowerCase() === 'get' && options.body) {
        // Convert body object to query parameters and append to URL
        const queryParams = new URLSearchParams(options.body).toString();
        finalUrl += `?${queryParams}`;
    } else {
        payloads['body'] = options.body ? JSON.stringify(options.body) : undefined;
    }

    let response: Response | null = null;
    try {
        response = await fetch(finalUrl, payloads);
        const ok = response.ok;
        const status = response.status;
        const data = ok ? await response.json() : {};
        return { ok, status, data };
    } catch (error) {
        console.warn(error);
        return { ok: false, status: 500, data: { error: 'Internal Server Error' } as T }
    }
};

const request = async <T>(...args: Parameters<typeof request_>): Promise<ResponseData<T>> => {
    try {
        return request_(...args);
    } catch (error) {
        console.warn(error);
        return { ok: false, status: 500, data: { error: 'Internal Server Error' } as T }
    }
}


export { request };
