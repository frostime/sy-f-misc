/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-13 21:19:23
 * @FilePath     : /src/libs/device-storage.ts
 * @LastEditTime : 2024-07-13 21:35:43
 * @Description  : 
 */
import { Plugin } from "siyuan";

const DeviceStorage = async (plugin: Plugin) => {
    const device = window.siyuan.config.system;
    const fname = `Device@${device.id}.json`;
    let config = await plugin.loadData(fname);
    config = config || {};
    return {
        get: (key: string | number) => {
            return config[key];
        },
        set: async (key: string | number, value: any) => {
            config[key] = value;
            await plugin.saveData(fname, config);
        },
    }
}

export default DeviceStorage;
