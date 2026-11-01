// Only host/model boundaries are replaced. The executor, rules, chain, configuration
// stores, result conversion and tree lifecycle used by the tests are production code.
export { defaultConfig, defaultModelId } from '../../src/func/gpt/model/config';

export const modelRequests: IMessage[][] = [];
let replies: ICompletionResult[] = [];

export const setModelReplies = (...responses: ICompletionResult[]) => {
    replies = [...responses];
    modelRequests.length = 0;
};

export const complete = async (messages: IMessage[]): Promise<ICompletionResult> => {
    modelRequests.push(structuredClone(messages));
    const response = replies.shift();
    if (!response) throw new Error('Unexpected model request');
    return response;
};

export const useModel = () => { throw new Error('Safety-review model lookup is outside these tests'); };

// The tested migration is 3.3 → current. Earlier migrations and host dialogs must not run.
export const confirmDialog = () => { throw new Error('Unexpected migration dialog'); };
export const deepMerge = () => { throw new Error('Unexpected legacy provider migration'); };
