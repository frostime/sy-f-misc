/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:30:38
 * @FilePath     : /src/func/index.ts
 * @LastEditTime : 2024-03-23 21:49:15
 * @Description  : 
 */
import { Plugin } from "siyuan";
import * as nf from './new-file';

export const load = (plugin: Plugin) => {
    nf.load(plugin);
}
