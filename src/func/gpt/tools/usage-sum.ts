/** Sum requests belonging to one message version, retaining only counters reported by every request. */
export const sumReportedUsage = (
    previous?: ICompletionUsage | null,
    next?: ICompletionUsage | null
): ICompletionUsage | null => {
    if (!previous || !next) return null;
    const sum: ICompletionUsage = {};
    const known = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens'] as const) {
        if (known(previous[key]) && known(next[key])) sum[key] = previous[key] + next[key];
    }
    for (const bucket of ['prompt_tokens_details', 'completion_tokens_details'] as const) {
        const details: ICompletionUsageDetails = {};
        for (const [key, value] of Object.entries(previous[bucket] || {})) {
            const incoming = next[bucket]?.[key];
            if (known(value) && known(incoming)) details[key] = value + incoming;
        }
        if (Object.keys(details).length) sum[bucket] = details;
    }
    return Object.keys(sum).length ? sum : null;
};
