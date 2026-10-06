/** Compare the complete JSON-persisted state, not just timestamps or node counts.
 * Object key order is immaterial; array order and every stored field remain significant. */
export const serializeHistory = (history: IChatSessionHistoryV2): string =>
    JSON.stringify(history, (_key, value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    });
