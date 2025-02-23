/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:52:32
 * @FilePath     : /src/func/gpt/context-provider/index.ts
 * @LastEditTime : 2025-02-23 21:45:55
 * @Description  : 
 */
// import { inputDialog } from '@frostime/siyuan-plugin-kits';
import { FocusDocProvider, OpenedDocProvider } from './ActiveDocProvider';
import SelectedTextProvider from './SelectedTextProvider';
import SQLSearchProvicer from './SQLSearchProvicer';
import TextSearchProvider from './TextSearchProvider';
import URLProvider from './URLProvider';
import showSelectContextDialog from './SelectItems';
import TodayDailyNoteProvicer from './DailyNoteProvider';
import { showMessage } from 'siyuan';
import { globalMiscConfigs } from '../setting/store';
import { inputDialogForProvider } from './InputForProvder';

const contextProviders: CustomContextProvider[] = [
    SelectedTextProvider,
    FocusDocProvider,
    OpenedDocProvider,
    TodayDailyNoteProvicer,
    SQLSearchProvicer,
    TextSearchProvider,
    URLProvider,
];

/**
 * 处理隐私信息，将隐私关键词替换为屏蔽词
 * @param text 需要处理的文本
 * @returns 处理后的文本
 */
const handlePrivacy = (text: string): string => {
    if (!text) return text;
    const keywords = globalMiscConfigs.value.privacyKeywords.trim();
    if (!keywords) return text;

    const mask = globalMiscConfigs.value.privacyMask || '***';
    const keywordList = keywords.split('\n').filter(k => k.trim());

    let result = text;
    for (const keyword of keywordList) {
        if (!keyword.trim()) continue;
        result = result.replaceAll(keyword, mask);
    }
    return result;
}

/**
 * 处理上下文对象中的隐私信息
 * @param context 上下文对象
 * @returns 处理后的上下文对象
 */
const handleContextPrivacy = (context: IProvidedContext): IProvidedContext => {
    if (!context) return context;

    // 深拷贝以避免修改原对象
    const newContext = JSON.parse(JSON.stringify(context));

    // 处理 contextItems 中的文本
    newContext.contextItems = newContext.contextItems.map(item => ({
        ...item,
        name: handlePrivacy(item.name),
        content: handlePrivacy(item.content),
        title: handlePrivacy(item.title)
    }));

    // 处理描述信息
    // if (newContext.description) {
    //     newContext.description = handlePrivacy(newContext.description);
    // }

    return newContext;
}

const executeContextProvider = async (provider: CustomContextProvider): Promise<IProvidedContext> => {
    const option: Parameters<CustomContextProvider['getContextItems']>[0] = {
        query: '',
        selected: []
    };
    let id = window.Lute.NewNodeID();
    if (provider.name == FocusDocProvider.name) {
        id = provider.name;
    }
    let contextItems = [];
    if (provider.type === undefined || provider.type === 'normal') {
        contextItems = await provider.getContextItems(option);
    } else if (provider.type === 'input-line' || provider.type === 'input-area') {
        const query = await new Promise<string>((resolve, reject) => {
            inputDialogForProvider({
                title: provider.displayTitle,
                description: provider.description,
                type: provider.type === 'input-line' ? 'line' : 'area',
                confirm: (text) => {
                    resolve(text);
                },
                cancel: () => {
                    resolve(null);
                },
                width: '720px',
                height: provider.type === 'input-line' ? null : '320px',
            });
        });
        if (!query) return;
        option['query'] = query;
        contextItems = await provider.getContextItems(option);
    } else if (provider.type === 'submenu' && provider.loadSubmenuItems) {
        const candidates = await provider.loadSubmenuItems({});
        const selectedItems = await new Promise<ContextSubmenuItem[]>((resolve) => {
            showSelectContextDialog(candidates, {
                confirm: (selected) => {
                    resolve(selected);
                },
                destroyCallback: () => {
                    resolve(null);
                }
            });
        });

        if (!selectedItems || selectedItems.length === 0) return;

        option['selected'] = selectedItems;
        contextItems = await provider.getContextItems(option);
    } else {
        return;
    }

    if (!contextItems || contextItems.length === 0) {
        showMessage(`没有获取到 ${provider.name} 相关的数据`, 3000);
        return;
    }

    let context = ({
        id: id,
        name: provider.name,
        displayTitle: provider.displayTitle,
        description: provider.description,
        contextItems: contextItems,
    });

    switch (provider.name) {
        case SQLSearchProvicer.name:
            context.description += `\n查询代码如下: ${option['query']?.replaceAll('\n', ' ')}`;
            break;
        case TextSearchProvider.name:
            context.description += `\n搜索关键词如下: ${option['query']?.replaceAll('\n', ' ')}`;
            break;
        default:
            break;
    }

    // 处理隐私信息
    context = handleContextPrivacy(context);

    return context;
}

const assembleContext2Prompt = (contexts: IProvidedContext[]) => {
    if (contexts.length === 0) {
        return '';
    }
    let start = '<START_OF_THE_ATTACHED_CONTEXTS_CONTENT>\n\n';
    let contextsPrompt = contexts.map(context2prompt).join('\n\n');
    return start + contextsPrompt;
}

function context2prompt(context: IProvidedContext): string {
    if (context.contextItems.length === 0) {
        return '';
    }

    let prompt = '';

    prompt += `<${context.name} title="${context.displayTitle}" description="${context.description}">`;

    const itemPrompts = [];
    context.contextItems.forEach((item) => {
        let itemPrompt = '';
        itemPrompt += `<${context.name}.ITEM name="${item.name.replaceAll('\n', ' ')}" description="${item.description.replaceAll('\n', ' ')}">\n`;
        itemPrompt += `${item.content}\n`;
        itemPrompt += `</${context.name}.ITEM>`;
        itemPrompts.push(itemPrompt);
    });
    prompt += `\n${itemPrompts.join('\n').trim()}\n`;

    prompt += `</${context.name}>`;
    return prompt;
}

export { contextProviders, executeContextProvider, assembleContext2Prompt, handlePrivacy };
