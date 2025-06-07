/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:52:32
 * @FilePath     : /src/func/gpt/context-provider/index.ts
 * @LastEditTime : 2025-05-31 15:52:05
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
import { globalMiscConfigs, customContextProviders } from '../setting/store';
import { inputDialogForProvider } from './InputForProvder';
import { RecentUpdatedDocProvider } from './RecentDocProvider';
import { UserInputProvider } from './UserInputProvider';
import BlocksProvider from './BlocksProvider';

const contextProviders: CustomContextProvider[] = [
    UserInputProvider,
    SelectedTextProvider,
    FocusDocProvider,
    OpenedDocProvider,
    RecentUpdatedDocProvider,
    BlocksProvider,
    TodayDailyNoteProvicer,
    SQLSearchProvicer,
    TextSearchProvider,
    URLProvider
];

// 动态添加自定义上下文提供器（如果存在）
const getContextProviders = () => {
    let providers = [...contextProviders];
    if (customContextProviders?.preprocessProviders) {
        const ans = customContextProviders.preprocessProviders(providers);
        if (ans) {
            providers = ans;
        }
    }
    return providers;
};

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

const executeContextProvider = async (provider: CustomContextProvider, options?: {
    verbose?: boolean
}): Promise<IProvidedContext> => {

    const { verbose = true } = options || {};

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
        const query = await new Promise<string>((resolve) => {
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
                },
            });
        });

        if (!selectedItems || selectedItems.length === 0) return;

        option['selected'] = selectedItems;
        contextItems = await provider.getContextItems(option);
    } else {
        return;
    }

    if ((!contextItems || contextItems.length === 0) && verbose) {
        showMessage(`没有获取到 ${provider.name} 相关的数据`, 3000);
        return;
    }

    let providerMetaInfo = {
        name: provider.name,
        displayTitle: provider.displayTitle,
        description: provider.description
    }
    let metaInfo = provider?.contextMetaInfo ? provider.contextMetaInfo({
        input: option,
        items: contextItems
    }) : providerMetaInfo;
    metaInfo = { ...providerMetaInfo, ...metaInfo };

    let context = ({
        id: id,
        ...metaInfo,
        contextItems: contextItems,
    });

    // 处理隐私信息
    context = handleContextPrivacy(context);

    return context;
}

const assembleContext2Prompt = (contexts: IProvidedContext[]) => {
    if (contexts.length === 0) {
        return '';
    }
    // const contextsPrompt = contexts.map(context2prompt).join('\n\n');
    const contextsPrompt = contexts
        .map(context => {
            try {
                return context2prompt(context);
            } catch (error) {
                console.error(`Failed to process context: ${context.name}`, error);
                return ''; // Skip problematic contexts
            }
        })
        .filter(Boolean)
        .join('\n\n');

    if (!contextsPrompt.trim()) {
        return '';
    }

    let prompt = `
<reference_rules>
You may be provided with reference information between <reference> tags, and user\'s instructions after <user> tags.
IMPORTANT INSTRUCTIONS FOR REFERENCES:
1. NEVER mention XML tags or structure (<reference>, <source>, <content>) in your response.
2. NEVER emphasize to users that you were given reference information by default.
3. ONLY utilize information: 1) within <content> tags; 2) attributes/metadata in XML tag's.
4. Prioritize references over your knowledge when conflicts occur.
</reference_rules>

<reference>
${contextsPrompt}
</reference>

<user>
`.trim();
    return prompt;
}

function context2prompt(context: IProvidedContext): string {
    if (context.contextItems.length === 0) {
        return '';
    }

    let prompt = '';

    const attrTitle = context.displayTitle ? ` title="${context.displayTitle}"` : '';
    const attrDescription = context.description ? ` description="${context.description}"` : '';
    prompt += `<source type="${context.name}"${attrTitle}${attrDescription}>`;

    const itemPrompts = [];
    context.contextItems.forEach((item) => {
        let itemPrompt = '';
        const name = item.name ? `name="${item.name}"` : '';
        const description = item.description ? ` description="${item.description}"` : '';
        itemPrompt += `<content ${name}${description}>\n`;
        itemPrompt += `${item.content}\n`;
        itemPrompt += `</content>`;
        itemPrompts.push(itemPrompt);
    });
    prompt += `\n${itemPrompts.join('\n').trim()}\n`;

    prompt += `</source>`;
    return prompt;
}

export { executeContextProvider, assembleContext2Prompt, handlePrivacy, getContextProviders };
