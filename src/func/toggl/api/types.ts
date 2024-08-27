/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 11:22:23
 * @FilePath     : /src/func/toggl/api/types.ts
 * @LastEditTime : 2024-08-27 12:03:54
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
    beginning_of_week: number;
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
    client_name: string;
    description?: string;
    duration: number;
    id: number;
    project_active: boolean;
    project_billable: boolean;
    project_color: string;
    project_id?: number;
    project_name: string;
    start: string;
    stop: string;
    tag_ids?: number[];
    tags?: string[];
    task_id?: number;
    task_name: string;
    user_avatar_url: string;
    user_id: number;
    user_name: string;
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
