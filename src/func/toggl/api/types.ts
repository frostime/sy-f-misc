/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 11:22:23
 * @FilePath     : /src/func/toggl/api/types.ts
 * @LastEditTime : 2024-08-27 18:02:31
 * @Description  : 
 */
// types.ts

export interface User {
    id: number;
    api_token: string;
    email: string;
    fullname: string;
    image_url: string;
    created_at: string;
    updated_at: string;
    country_id: number;
    timezone: string;
    default_workspace_id: number;
}

export interface Workspace {
    id: number;
    name: string;
    organization_id: number;
    admin: boolean;
    role: string;
    logo_url: string;
}

export interface Project {
    id: number;
    name: string;
    active: boolean;
    is_private: boolean;
    billable: boolean;
    client_id?: number;
    workspace_id: number;
    status: string;
    color: string;
}

export interface TimeEntry {
    at: string;
    billable: boolean;
    description?: string;
    duration: number;
    id: number;
    project_id?: number;
    start: string;
    stop: string | null;
    tag_ids?: number[];
    tags?: string[];
    user_id: number;
    workspace_id: number;
}

export interface Tag {
    id: number;
    creator_id: number;
    workspace_id: number;
    name: string;
    deleted_at: string;
    at: string;
}
