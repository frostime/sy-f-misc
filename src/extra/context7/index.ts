/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-02-17 14:08:12
 * @Description  :
 * @FilePath     : /src/func/private-func/context7/index.ts
 * @LastEditTime : 2026-02-17 16:29:16
 */
import { openIframeTab } from "@/func/html-pages/core";
import { runMarkdownPostRender } from "@/func/gpt/chat/components/MessageItem.helper";
import { loadContext7ClientConfig, patchContext7ClientConfig, recordContext7LibraryHistory, type IContext7ClientConfig } from "./config";
import { createContext7Sdk } from "./context7-sdk";
import { getLute } from "@frostime/siyuan-plugin-kits";


const resolveRequestOptions = async (override?: Partial<IContext7ClientConfig>) => {
    const current = await loadContext7ClientConfig();
    return {
        apiKey: override?.apiKey ?? current.apiKey,
        baseUrl: override?.baseUrl ?? current.baseUrl,
        timeoutMs: override?.timeoutMs ?? current.timeoutMs,
    };
};

const context7Sdk = createContext7Sdk();
// const markdownRenderer = (() => {
//     try {
//         const renderer = createMarkdownRenderer();
//         return (text: string) => renderer.renderMarkdown(text, false);
//     } catch (error) {
//         console.warn('Context7 fallback markdown renderer is used:', error);
//         return (text: string) => window.Lute?.Md2HTML ? window.Lute.Md2HTML(text) : text;
//     }
// })();

export function openContext7Client() {
    const tab = openIframeTab({
        tabId: 'private-context7-client',
        title: 'Context7',
        icon: 'iconBot',
        // position: 'right',
        iframeConfig: {
            type: 'url',
            source: '/plugins/sy-f-misc/pages/context7-client.html',
            inject: {
                presetSdk: true,
                siyuanCss: true,
                customSdk: {
                    loadClientConfig: async (): Promise<IContext7ClientConfig> => {
                        return await loadContext7ClientConfig();
                    },
                    saveClientConfig: async (partial: Partial<IContext7ClientConfig>) => {
                        return await patchContext7ClientConfig(partial, true);
                    },
                    renderMarkdown: (markdown: string) => {
                        // return markdownRenderer(String(markdown || ''));
                        const lute = getLute();
                        const div = document.createElement('div');
                        //@ts-ignore
                        div.innerHTML = lute.Md2HTML(String(markdown || ''));
                        runMarkdownPostRender(div, {
                            addCodeActionBar: false
                        });
                        return div.innerHTML;
                    },
                    listLibraryHistories: async () => {
                        const config = await loadContext7ClientConfig();
                        return config.histories;
                    },
                    recordLibraryHistory: async (libraryId: string) => {
                        return await recordContext7LibraryHistory(libraryId);
                    },
                    searchLibraries: async (params: { libraryName: string; query: string; config?: Partial<IContext7ClientConfig> }) => {
                        const requestOptions = await resolveRequestOptions(params.config);
                        return await context7Sdk.searchLibraries({
                            libraryName: params.libraryName,
                            query: params.query,
                            ...requestOptions,
                        });
                    },
                    getContext: async (params: {
                        libraryId: string;
                        query: string;
                        type?: 'json' | 'txt';
                        config?: Partial<IContext7ClientConfig>;
                    }) => {
                        const requestOptions = await resolveRequestOptions(params.config);
                        return await context7Sdk.getContext({
                            libraryId: params.libraryId,
                            query: params.query,
                            type: params.type,
                            ...requestOptions,
                        });
                    }
                }
            },
            onLoad: (iframe) => {
                console.log("Context7 Client loaded");
            }
        }
    });

    return tab;
}
