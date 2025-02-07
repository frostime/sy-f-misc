/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-24 15:11:11
 * @FilePath     : /src/func/insert-time.ts
 * @LastEditTime : 2025-01-07 12:18:36
 * @Description  : 
 */
import {
    Protyle
} from "siyuan";

import type FMiscPlugin from "@/index";
import { debounce, thisPlugin } from "@frostime/siyuan-plugin-kits";


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


let TemplatePattern = `
Now; xz now ; yyyy-MM-dd HH:mm:ss
Date; rq date jt today ; yyyy-MM-dd
Time; sj time ; HH:mm:ss
`.trim();
let Templates: {
    filter: string[],
    name: string,
    template: string
}[] = [];


const ParseTemplatePattern = () => {
    Templates = [];
    const lines = TemplatePattern.trim().split('\n');
    lines.forEach(line => {
        const parts = line.split(';').map(part => part.trim());
        if (parts.length >= 3) {
            const name = parts[0];
            const filter = parts[1].split(/\s+/);
            const template = parts.slice(2).join(';'); 
            Templates.push({
                name,
                filter,
                template
            });
        }
    });
}
// let Templates = {
//     datetime: {
//         filter: ['xz', 'now'],
//         name: 'Now',
//         template: 'yyyy-MM-dd HH:mm:ss'
//     },
//     date: {
//         filter: ['rq', 'date', 'jt', 'today'],
//         name: 'Date',
//         template: 'yyyy-MM-dd'
//     },
//     time: {
//         filter: ['sj', 'time'],
//         name: 'Time',
//         template: 'HH:mm:ss'
//     }
// };


let protyleSlash: IPluginProtyleSlash[] = [];
const slashIds: Set<string> = new Set();

const updateProtyleSlash = () => {
    if (!enabled) return;
    const plugin = thisPlugin();
    // 先把现在的删掉
    slashIds.forEach((id) => {
        plugin.delProtyleSlash(id);
    });
    slashIds.clear();

    ParseTemplatePattern();
    protyleSlash = Object.values(Templates).map((template) => {
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
    protyleSlash.forEach((slash) => {
        slashIds.add(slash.id);
        plugin.addProtyleSlash(slash);
    });
};
const updateProtyleSlashDebounced = debounce(updateProtyleSlash, 1500);

const updateTime = (e) => {
    if (e.key === '/') {
        const plugin = thisPlugin();
        plugin.protyleSlash.forEach((slash) => {
            if (slashIds.has(slash.id)) {
                //@ts-ignore
                slash?.update();
            }
        })
    }
}

export let name = "InsertTime";
export let enabled = false;

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "insert-time",
    title: "插入时间",
    load: (itemValues: any) => {
        if (itemValues.templatePattern) {
            TemplatePattern = itemValues.templatePattern;
        }
        updateProtyleSlash();
    },
    dump: () => {
        return {
            templatePattern: TemplatePattern
        }
    },
    items: [
        {
            key: 'templatePattern',
            type: 'textarea' as const,
            title: '模板模式',
            description: `
                插入时间模板，每行一个，格式为：<br/>
                <code>模板名称; 触发词1 触发词2; 时间格式</code><br/>
                例如：<br/>
                <code>Now; xz now; yyyy-MM-dd HH:mm:ss</code>
            `,
            direction: 'row',
            get: () => TemplatePattern,
            set: (value: string) => {
                TemplatePattern = value;
                updateProtyleSlashDebounced();
            }
        }
    ],
};

export const declareToggleEnabled = {
    title: '⌚ 插入时间',
    description: '通过快捷指令插入时间',
    defaultEnabled: false
};

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    updateProtyleSlash();
    window.addEventListener('keypress', updateTime);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;

    protyleSlash.forEach((slash) => {
        plugin.delProtyleSlash(slash.id);
    });
    window.removeEventListener('keypress', updateTime);
}
