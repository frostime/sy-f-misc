/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 11:23:05
 * @FilePath     : /src/func/toggl/api/time_entries.ts
 * @LastEditTime : 2025-01-01 21:59:17
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
    /**
     * curl -X PUT https://api.track.toggl.com/api/v9/workspaces/{workspace_id}/time_entries/{time_entry_id} \
  -H "Content-Type: application/json" \
  -d '\{"billable":"boolean","created_with":"string","description":"string","duration":"integer","duronly":"boolean","event_metadata":\{"origin_feature":"string","visible_goals_count":"integer"\},"pid":"integer","project_id":"integer","shared_with_user_ids":[\{\}],"start":"string","start_date":"string","stop":"string","tag_action":"string","tag_ids":[\{\}],"tags":[\{\}],"task_id":"integer","tid":"integer","uid":"integer","user_id":"integer","wid":"integer","workspace_id":"integer"\}' \
  -u <email>:<password>
     */
    const url = `https://api.track.toggl.com/api/v9/workspaces/${me().default_workspace_id}/time_entries/${timeEntryId}`;
    return request<TimeEntry>(url, { method: 'PUT', body: args });
};
