const isReportedCount = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
};

/** Counts here belong to one message version. Detail counters are subsets, not extra totals. */
export const describeUsage = (usage?: ICompletionUsage) => {
    const count = (value: unknown) => isReportedCount(value) ? value.toLocaleString() : '—';
    const rows: { label: string; value: string }[] = [];
    const add = (label: string, value: unknown) => {
        if (isReportedCount(value)) rows.push({ label, value: count(value) });
    };
    add('总量', usage?.total_tokens);
    add('输入', usage?.prompt_tokens);
    add('输出', usage?.completion_tokens);

    const addDetails = (details: ICompletionUsageDetails | undefined, labels: Record<string, string>, direction: string) => {
        for (const [key, value] of Object.entries(details || {})) {
            // The normalized name and the raw provider alias describe the same count.
            if (key === 'cache_write_tokens' && isReportedCount(details.cache_creation_tokens)) continue;
            add(labels[key] || `其他${direction}明细 · ${key}`, value);
        }
    };
    addDetails(usage?.prompt_tokens_details, {
        cached_tokens: '缓存读取（输入）',
        cache_creation_tokens: '缓存写入（输入）',
        cache_write_tokens: '缓存写入（输入）',
        uncached_tokens: '未缓存输入',
        tool_use_tokens: '工具输入',
        audio_tokens: '音频输入',
        image_tokens: '图像输入',
        text_tokens: '文本输入',
    }, '输入');
    addDetails(usage?.completion_tokens_details, {
        reasoning_tokens: '推理（输出）',
        audio_tokens: '音频输出',
        text_tokens: '文本输出',
        accepted_prediction_tokens: '接受的预测 token',
        rejected_prediction_tokens: '拒绝的预测 token',
    }, '输出');
    return {
        summary: `Token: ${count(usage?.total_tokens)} (${count(usage?.prompt_tokens)}↑ ${count(usage?.completion_tokens)}↓)`,
        rows,
    };
};
