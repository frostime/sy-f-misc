import { saveToSiYuan, itemsToMarkdown } from "./sy-doc";
import { saveToJson } from "./json-files";
import { saveToLocalStorage, listFromLocalStorage } from "./local-storage";

export const persistHistory = async (history: IChatSessionHistory) => {
    await Promise.all([
        saveToSiYuan(history),
        saveToJson(history)
    ]);
}

export {
    itemsToMarkdown,
    saveToLocalStorage,
    listFromLocalStorage
};
