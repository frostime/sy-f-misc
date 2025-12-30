/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-30 16:54:34
 * @FilePath     : /src/func/gpt/tools/custom-program-tools/resolve/common.ts
 */
import { putFile } from '@/api';
import { fileExists, readJsonFile, getFileModifiedTime } from '../utils';
import type { ParsedToolModule } from '../types';

const fs = window?.require?.('fs');
const path = window?.require?.('path');

export const checkSyncIgnore = async () => {
    const syncignorePath = '.siyuan/syncignore';
    const requiredIgnores = [
        'snippets/fmisc-custom-toolscripts/__pycache__/**',
    ];

    const ignoreFilePath = path.join(window.siyuan.config.system.dataDir, syncignorePath);

    if (!fileExists(ignoreFilePath)) {
        const defaultIgnores = requiredIgnores.join('\n');
        const blob = new Blob([defaultIgnores], { type: 'text/plain' });
        await putFile('data/' + syncignorePath, false, blob);
        return;
    }

    const content = fs.readFileSync(ignoreFilePath, 'utf-8');
    const lines = content.split('\n').map((line: string) => line.trim());

    let needsUpdate = false;
    for (const ignoreRule of requiredIgnores) {
        if (!lines.includes(ignoreRule)) {
            lines.push(ignoreRule);
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        const newContent = lines.join('\n');
        const blob = new Blob([newContent], { type: 'text/plain' });
        await putFile('data/' + syncignorePath, false, blob);
    }
};

export const loadToolDefinition = async (
    toolJsonPath: string
): Promise<(ParsedToolModule['moduleData'] & { lastModified?: number }) | null> => {
    try {
        const data = await readJsonFile(toolJsonPath);
        if (!data.type || !data.name || !Array.isArray(data.tools)) {
            console.warn('Invalid tool definition format:', toolJsonPath);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Failed to load tool definition:', toolJsonPath, error);
        return null;
    }
};

/**
 * 检查脚本是否需要重新解析
 * 复用 utils.ts 中的 getFileModifiedTime
 */
export const needsReparse = (scriptPath: string, toolJsonPath: string): boolean => {
    if (!fileExists(toolJsonPath)) return true;

    try {
        const jsonContent = fs.readFileSync(toolJsonPath, 'utf-8');
        const data = JSON.parse(jsonContent);

        if (data.lastModified !== undefined) {
            const currentScriptTime = getFileModifiedTime(scriptPath);
            return currentScriptTime > data.lastModified;
        }
    } catch {
        // 解析失败，需要重新解析
    }

    return true;
};
