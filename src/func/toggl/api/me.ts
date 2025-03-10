/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 11:22:44
 * @FilePath     : /src/func/toggl/api/me.ts
 * @LastEditTime : 2025-01-01 21:24:39
 * @Description  : 
 */
// me.ts

import { request } from './requests';
import { Workspace, type Project, type Tag, type User } from './types';

const BASE_URL = 'https://api.track.toggl.com/api/v9/me';

const url = (route?: string, prefix: string = BASE_URL) => `${prefix}${route ? `/${route}` : ''}`;

export const getMe = async (with_related_data?: boolean) => {
    with_related_data = with_related_data ?? false;
    return request<User>(BASE_URL, { method: 'GET', body: { with_related_data: with_related_data } });
};

export const getProjects = async (args?: {
    include_archived?: boolean;
    since?: number
}) => {
    return request<Project[]>(url('projects'), { method: 'GET', body: args });
};

export const getTags = async (args?: { since?: number }) => {
    return request<Tag[]>(url('tags'), { method: 'GET', body: args });
}


export const getWorkspaces = async () => {
    return request<Workspace[]>(url('workspaces'), { method: 'GET' });
}
