/**
 * 临时保存在 localStorage 中, key 为 ID
 */

/**
 * 临时保存在 localStorage 中, key 为 ID
 */
export const saveToLocalStorage = (history: IChatSessionHistory) => {
    const key = `gpt-chat-${history.id}`;
    localStorage.setItem(key, JSON.stringify(history));
}

export const listFromLocalStorage = (): IChatSessionHistory[] => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('gpt-chat-'));
    return keys.map(key => JSON.parse(localStorage.getItem(key)));
}

export const removeFromLocalStorage = (id: string) => {
    const key = `gpt-chat-${id}`;
    localStorage.removeItem(key);
}
