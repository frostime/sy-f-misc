/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-01-01 22:22:24
 * @FilePath     : /src/func/toggl/state/index.ts
 * @LastEditTime : 2025-01-02 01:31:33
 * @Description  : 
 */
export * as config from "./config";
export * as active from "./active";

export {
    me, isConnected, projects, config as configRef, save, load
} from './config';
export {
    activeEntry, elapsedTime, syncEntry, startEntry, stopEntry, updateEntry
} from './active';
