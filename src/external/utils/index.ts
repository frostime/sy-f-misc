/**
 * 目录式外部模块范例
 * 文件路径: src/external/utils/index.ts
 * 引用方式: import * as utils from '@external/utils'
 * 编译后路径: dist/external/utils/index.js
 * 运行时路径: /plugins/sy-f-misc/external/utils/index.js
 */

export const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
};

export const capitalize = (str: string) => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const debounce = <T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): ((...args: Parameters<T>) => void) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

export class Logger {
    private prefix: string;

    constructor(prefix: string) {
        this.prefix = prefix;
    }

    log(message: string) {
        console.log(`[${this.prefix}] ${message}`);
    }

    error(message: string, error?: Error) {
        console.error(`[${this.prefix}] ${message}`, error);
    }
}

export default {
    formatDate,
    capitalize,
    debounce,
    Logger
};
