/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 11:23:05
 * @FilePath     : /src/func/toggl/api/time_entries.ts
 * @LastEditTime : 2024-08-27 12:19:40
 * @Description  : 
 */
// time_entries.ts

import { request } from './requests';
import { TimeEntry } from './types';

const BASE_URL = 'https://api.track.toggl.com/api/v9/me/time_entries';
const url = (route?: string) => `${BASE_URL}${route ? `/${route}` : ''}`;


export const getTimeEntries = async (args?: {
    meta?: boolean;
    since?: number;
    before?: string;
    start_date?: string;
    end_date?: string;
}) => {
    return request<TimeEntry[]>(BASE_URL, { method: 'GET', body: args });
};

export const getCurrentTimeEntry = async () => {
    return request<TimeEntry | null>(url('current'), { method: 'GET' });
}
