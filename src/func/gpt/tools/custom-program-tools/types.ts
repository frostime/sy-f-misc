/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-30 16:54:14
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/types.ts
 */
import { ToolPermission } from '../types';

export interface ParsedToolModule {
    scriptName: string;
    scriptPath: string;
    toolJsonPath: string;
    scriptType: 'python' | 'powershell';
    moduleData: {
        type: 'PythonModule' | 'PowerShellModule';
        name: string;
        scriptPath: string;
        tools: IToolDefinition[];
        rulePrompt?: string;
        defaultPermissions?: ToolPermission;
    };
    lastModified: number;
}

export interface CustomToolExecutionContext {
    scriptPath: string;
    functionName: string;
    args: Record<string, any>;
    timeout?: number;
    outputLimit?: number;
}
