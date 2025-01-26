/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-26 21:52:32
 * @FilePath     : /src/func/gpt/context-provider/index.ts
 * @LastEditTime : 2025-01-26 22:30:11
 * @Description  : 
 */
import ActiveDocProvider from './ActiveDocProvider';
import SelectedTextProvider from './SelectedTextProvider';
import SQLSearchProvicer from './SQLSearchProvicer';

const contextProviders: CustomContextProvider[] = [
    ActiveDocProvider,
    SelectedTextProvider,
    SQLSearchProvicer,
];

const executeContextProvider = async (provider: CustomContextProvider, option?: Parameters<CustomContextProvider['getContextItems']>[0]) => {
    let contextItems = await provider.getContextItems(option);
    let context = ({
        name: provider.name,
        displayTitle: provider.displayTitle,
        description: provider.description,
        contextItems: contextItems,
    });
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
        prompt += `[${item.name}]` + item.description + '| Content as follows:\n';
        prompt += item.content + '\n';
    } else {
        context.contextItems.forEach((item) => {
            prompt += `---------- Item ${item.name} ----------\n`;
            prompt += `${item.description} | Content as follows:\n`;
            prompt += `${item.content}\n\n`;
        });
    }

    prompt += `${sep} End of Context: ${context.displayTitle} ${sep}`;
    return prompt;
}
export { contextProviders, executeContextProvider, assembleContext2Prompt };
