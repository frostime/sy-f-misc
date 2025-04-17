/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-04-17 18:16:50
 * @FilePath     : /src/func/private-func/config.ts
 * @LastEditTime : 2025-04-17 19:47:14
 * @Description  : 
 */
import { toggleDisable, toggleEnable } from "./auto-sync";

export const config = {
    AutoSyncAfterLongWait: false,
    WAIT_INTERVAL_HOURS: 4
}

// Optional: Declare simple module config
export const declareModuleConfig = {
    key: "PrivateFunc",
    items: [
        {
            key: 'AutoSyncAfterLongWait',
            title: '长间隔后自动同步',
            description: '主要用于长期不使用后，再次打开思源进行交互的时候，会自动点击同步按钮；替代总是出问题的同步感知功能；作用相当于手动点击同步按钮',
            type: 'checkbox',
            get: () => config.AutoSyncAfterLongWait,
            set: (value: boolean) => {
                config.AutoSyncAfterLongWait = value;

                if (value) {
                    toggleEnable();
                } else {
                    toggleDisable();
                }
            }
        },
        {
            key: 'WAIT_INTERVAL_HOURS',
            title: '长间隔后自动同步等待时间',
            description: '等待的时间，单位为小时，默认为 4 小时',
            type: 'number',
            get: () => config.WAIT_INTERVAL_HOURS,
            set: (value: string) => {
                config.WAIT_INTERVAL_HOURS = parseFloat(value);
            }
        }
    ] as IConfigItem<any>[],
    load: (itemValues?: Record<string, any>) => {
        if (itemValues?.AutoSyncAfterLongWait !== undefined) {
            config.AutoSyncAfterLongWait = itemValues.AutoSyncAfterLongWait;
        }
        if (itemValues?.WAIT_INTERVAL_HOURS !== undefined) {
            config.WAIT_INTERVAL_HOURS = parseFloat(itemValues.WAIT_INTERVAL_HOURS);
        }
    }
};
