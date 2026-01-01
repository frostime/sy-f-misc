/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-01-01 23:06:39
 * @Description  : CodeMirror 5 Editor Launcher
 * @FilePath     : /src/libs/editor/index.ts
 */
import { openIframeTab } from "@/func/html-pages/core";

const simpleHash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

/**
 * 启动代码编辑器 Tab
 * @param options
 * @param options.source - 初始代码内容
 * @param options.language - 语言模式 (e.g. 'javascript', 'markdown', 'python')
 * @param options.allowSwitch - 是否允许用户切换语言 (默认 true)
 * @param options.onSave - 保存回调，返回 boolean 或 Promise<boolean> 表示成功与否
 */
export const launchEditor = (options: {
    source: string,
    language?: string,
    allowSwitch?: boolean,
    onSave: (text: string) => Promise<boolean> | boolean,
}) => {
    const sourceHash = simpleHash(options.source);
    const { source, onSave, language, allowSwitch } = options;

    openIframeTab({
        tabId: 'editor' + String(sourceHash),
        title: '代码编辑器',
        icon: 'iconCode',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/code-editor.html',
            inject: {
                presetSdk: true,
                siyuanCss: true,
                customSdk: {
                    getText: () => {
                        return source;
                    },
                    setText: (text: string) => {
                        const result = onSave(text);
                        if (result instanceof Promise) {
                            return result;
                        } else {
                            return Promise.resolve(result);
                        }
                    },
                    // 传递配置给 HTML 页面
                    langType: language,
                    allowSwitch: allowSwitch ?? true,
                }
            }
        },
    });
}
