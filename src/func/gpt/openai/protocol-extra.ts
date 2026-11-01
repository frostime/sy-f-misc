// Internal assistant replay data. Adapters own wire conversion; opaque signatures
// and encrypted blocks remain separate from display text.
export const getProviderProtocol = (runtime?: IRuntimeLLM): LLMProviderProtocol => {
    const raw = (runtime?.provider?.protocol || runtime?.provider?.protocal || runtime?.protocol || 'openai').toLowerCase();
    if (raw === 'claude' || raw === 'gemini' || raw === 'openai') return raw;
    return raw === 'anthropic' ? 'claude' : 'openai';
};

export const bindExtraSource = (extra: IMessageExtra, runtime: IRuntimeLLM): IMessageExtra => ({
    ...extra,
    model: runtime.model,
    provider: runtime.provider?.name,
});

export const getCompatibleExtra = (message: IMessage, runtime: IRuntimeLLM): IMessageExtra | undefined => {
    if (message.role !== 'assistant') return undefined;
    const extra = message.extra;
    if (!extra || extra.protocol !== getProviderProtocol(runtime)) return undefined;
    if (extra.model !== undefined && extra.model !== runtime.model) return undefined;
    if (extra.provider !== undefined && extra.provider !== runtime.provider?.name) return undefined;
    return extra;
};


