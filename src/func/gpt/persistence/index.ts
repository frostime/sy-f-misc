import { saveToSiYuan } from "./sy-doc";
import { saveToJson } from "./json-files";

export const persistHistory = async (history: IChatSessionHistory) => {
    await Promise.all([
        saveToSiYuan(history),
        saveToJson(history)
    ]);
}

export * from "./sy-doc";
export * from "./json-files";
export * from "./local-storage";