/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-24 15:11:11
 * @FilePath     : /src/func/insert-time.ts
 * @LastEditTime : 2024-10-20 17:05:46
 * @Description  : 
 */
import {
    Protyle
} from "siyuan";

import type FMiscPlugin from "@/index";


const renderString = (template: string, data: { [key: string]: string }) => {
    for (let key in data) {
        template = template.replace(key, data[key]);
    }
    return template;
}

const formatDateTime = (template: string, now?: Date) => {
    now = now || new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    let day = now.getDate();
    let hour = now.getHours();
    let minute = now.getMinutes();
    let second = now.getSeconds();
    return renderString(template, {
        'yyyy': year.toString(),
        'MM': month.toString().padStart(2, '0'),
        'dd': day.toString().padStart(2, '0'),
        'HH': hour.toString().padStart(2, '0'),
        'mm': minute.toString().padStart(2, '0'),
        'ss': second.toString().padStart(2, '0'),
        'yy': year.toString().slice(-2),
    });
}


let Templates = {
    datetime: {
        filter: ['xz', 'now'],
        name: 'Now',
        template: 'yyyy-MM-dd HH:mm:ss'
    },
    date: {
        filter: ['rq', 'date', 'jt', 'today'],
        name: 'Date',
        template: 'yyyy-MM-dd'
    },
    time: {
        filter: ['sj', 'time'],
        name: 'Time',
        template: 'HH:mm:ss'
    }
};


const protyleSlash = Object.values(Templates).map((template) => {
    return {
        filter: template.filter,
        html: `<span>${template.name} ${formatDateTime(template.template)}</span>`,
        id: template.name,
        callback: (protyle: Protyle) => {
            let strnow = formatDateTime(template.template);
            console.log(template.name, strnow);
            protyle.insert(strnow, false);
        },
        //@ts-ignore
        update() {
            this.html = `<span>${template.name} ${formatDateTime(template.template)}</span>`;
        }
    }
});
const slashIds: Set<string> = new Set();
protyleSlash.forEach((slash) => {
    slashIds.add(slash.id);
});
let pluginProtyleSlash: IPluginProtyleSlash[] = [];

const updateTime = (e) => {
    if (e.key === '/') {
        pluginProtyleSlash.forEach((slash) => {
            if (slashIds.has(slash.id)) {
                //@ts-ignore
                slash?.update();
            }
        })
    }
}

export let name = 'InsertTime';
export let enabled = false;

export const declareToggleEnabled = {
    title: '⌚ Insert time',
    description: '启用插入时间功能',
    defaultEnabled: true
};

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;

    pluginProtyleSlash = plugin.protyleSlash;
    protyleSlash.forEach((slash) => {
        plugin.addProtyleSlash(slash);
    });
    window.addEventListener('keypress', updateTime);
    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;

    pluginProtyleSlash = [];
    protyleSlash.forEach((slash) => {
        plugin.delProtyleSlash(slash.id);
    });
    window.removeEventListener('keypress', updateTime);
    enabled = false;
}

