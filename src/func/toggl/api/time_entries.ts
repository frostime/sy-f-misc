/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 11:23:05
 * @FilePath     : /src/func/toggl/api/time_entries.ts
 * @LastEditTime : 2025-01-01 21:49:04
 * @Description  : 
 */
// time_entries.ts

import { request } from './requests';
import { TimeEntry } from './types';
import { me } from '../state';

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

export const startTimeEntry = async (args: {
    description?: string;
    project_id?: number;
    tag_ids?: number[];
    workspace_id: number;
}) => {
    return request<TimeEntry>(`https://api.track.toggl.com/api/v9/workspaces/${me().default_workspace_id}/time_entries`, {
        method: 'POST',
        body: {
            ...args,
            created_with: 'SiYuan',
            start: new Date().toISOString(),
            duration: -1  // Negative duration indicates running timer
        }
    });
};

export const stopTimeEntry = async (timeEntryId: number) => {
    // https://api.track.toggl.com/api/v9/workspaces/{workspace_id}/time_entries/{time_entry_id}/stop
    const url = `https://api.track.toggl.com/api/v9/workspaces/${me().default_workspace_id}/time_entries/${timeEntryId}/stop`;
    return request<TimeEntry>(url, {
        method: 'PATCH'
    });
};

export const updateTimeEntry = async (timeEntryId: number, args: {
    description?: string;
    project_id?: number | null;
    tag_ids?: number[];
}) => {
    const url = `https://api.track.toggl.com/api/v9/workspaces/${me().default_workspace_id}/time_entries/${timeEntryId}`;
    let body = [];
    for (const key in args) {
        if (args[key] === undefined) continue;
        body.push({
            op: 'replace',
            path: key,
            value: args[key]
        });
    }
    return request<TimeEntry>(url, { method: 'PATCH', body });
};
