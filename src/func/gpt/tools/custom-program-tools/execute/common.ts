/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-30 16:55:32
 * @Description  :
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/execute/common.ts
 * @LastEditTime : 2025-12-30 19:02:12
 */
import { ToolPermission, ToolPermissionLevel } from '../../types';
import { globalMiscConfigs } from '../../../model/store';

const process = window?.require?.('process') || (window as any).process;

export const getEnvVars = () => {
    const envStr = globalMiscConfigs().CustomScriptEnvVars || '';
    const env = { ...(process?.env || {}) };
    const lines = envStr.split('\n');
    for (const line of lines) {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (match) {
            env[match[1]] = match[2].trim();
        }
    }
    return env;
};

export const extractPermissionConfig = (toolDef: IToolDefinition): ToolPermission => {
    const config: any = {};

    if ((toolDef as any).permissionLevel) {
        const level = (toolDef as any).permissionLevel;
        if (level === 'public') config.permissionLevel = ToolPermissionLevel.PUBLIC;
        else if (level === 'moderate') config.permissionLevel = ToolPermissionLevel.MODERATE;
        else if (level === 'sensitive') config.permissionLevel = ToolPermissionLevel.SENSITIVE;
    } else {
        config.permissionLevel = ToolPermissionLevel.SENSITIVE;
    }

    if ((toolDef as any).requireExecutionApproval !== undefined) {
        config.requireExecutionApproval = (toolDef as any).requireExecutionApproval;
    } else {
        config.requireExecutionApproval = true;
    }

    if ((toolDef as any).requireResultApproval !== undefined) {
        config.requireResultApproval = (toolDef as any).requireResultApproval;
    } else {
        config.requireResultApproval = true;
    }

    return config;
};

export const extractDeclaredReturnType = (toolDef: IToolDefinition): { type: string; note?: string } | undefined => {
    const declaredReturnType = (toolDef as any).declaredReturnType;
    if (declaredReturnType && typeof declaredReturnType.type === 'string') {
        return {
            type: declaredReturnType.type,
            note: declaredReturnType.note
        };
    }
    return undefined;
};