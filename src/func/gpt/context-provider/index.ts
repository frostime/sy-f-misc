/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:52:32
 * @FilePath     : /src/func/gpt/context-provider/index.ts
 * @LastEditTime : 2025-01-27 21:30:14
 * @Description  : 
 */
import { inputDialog } from '@frostime/siyuan-plugin-kits';
import { FocusDocProvider, OpenedDocProvider } from './ActiveDocProvider';
import SelectedTextProvider from './SelectedTextProvider';
import SQLSearchProvicer from './SQLSearchProvicer';

import showSelectContextDialog from './SelectItems';

const contextProviders: CustomContextProvider[] = [
    SelectedTextProvider,
    FocusDocProvider,
    OpenedDocProvider,
    SQLSearchProvicer,
];

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
    } else if (provider.type === 'query') {
        const query = await new Promise<string>((resolve, reject) => {
            inputDialog({
                title: provider.description,
                type: 'textarea',
                confirm: (text) => {
                    resolve(text);
                },
                destroyCallback: () => {
                    resolve(null);
                },
                width: '540px',
                height: '320px',
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

    let context = ({
        id: id,
        name: provider.name,
        displayTitle: provider.displayTitle,
        description: provider.description,
        contextItems: contextItems,
    });

    switch (provider.name) {
        case SQLSearchProvicer.name:
            context.description = `SQL 查询结果: ${option['query']?.replaceAll('\n', ' ')}`;
            break;
        default:
            break;
    }

    return context;
}

const assembleContext2Prompt = (contexts: IProvidedContext[]) => {
    if (contexts.length === 0) {
        return '';
    }
    let start = '**The following is the attached contexts**:\n\n';
    let contextsPrompt = contexts.map(context2prompt).join('\n\n');
    return start + contextsPrompt;
}

function context2prompt(context: IProvidedContext): string {
    if (context.contextItems.length === 0) {
        return '';
    }
    const sep = '='.repeat(15);
    let prompt = `${sep} Start of Context: ${context.displayTitle} ${sep}\n`;
    prompt += `Description: ${context.description}\n`;

    if (context.contextItems.length === 1) {
        let item = context.contextItems[0];
        prompt += `[${item.name.replaceAll('\n', ' ')}]` + item.description + '| Content as follows:\n';
        prompt += item.content + '\n';
    } else {
        context.contextItems.forEach((item) => {
            prompt += `---------- Item ${item.name.replaceAll('\n', ' ')} ----------\n`;
            prompt += `${item.description} | Content as follows:\n`;
            prompt += `${item.content}\n\n`;
        });
    }

    prompt += `${sep} End of Context: ${context.displayTitle} ${sep}`;
    return prompt;
}

export { contextProviders, executeContextProvider, assembleContext2Prompt };
