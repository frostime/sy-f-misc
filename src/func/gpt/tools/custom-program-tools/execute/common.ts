/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-30 16:55:32
 * @Description  :
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/execute/common.ts
 * @LastEditTime : 2026-01-05 14:55:37
 */
import { ToolPermissionV2 } from '../../types';
import { globalMiscConfigs } from '../../../model/store';

const process = window?.require?.('process') || (window as any).process;

export const getEnvVars = () => {
    const envStr = globalMiscConfigs().CustomScriptEnvVars || '';
    const env = { ...(process?.env || {}) };
    const lines = envStr.split('\n');
    for (const line of lines) {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (match) {
            const name = match[1];
            let value = match[2];
            value = value.replaceAll('{{SIYUAN_WORKSPACE}}', window.siyuan.config.system.workspaceDir);
            env[name] = value.trim();
        }
    }
    return env;
};

export const extractPermissionConfig = (toolDef: IToolDefinition): ToolPermissionV2 => {
    const config: ToolPermissionV2 = {
        executionPolicy: (toolDef as any).executionPolicy || 'ask-once',
        resultApprovalPolicy: (toolDef as any).resultApprovalPolicy || 'never'
    };

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