/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-03 22:00:08
 * @FilePath     : /src/libs/open-tab.ts
 * @LastEditTime : 2024-08-04 16:42:36
 * @Description  : 
 */
import { Custom, openTab, type Plugin } from "siyuan";
export const openCustomTab = (plugin: Plugin, args: {
    id: string,
    render: (container: HTMLElement) => void,
    destroyCb: () => void,
    title?: string
}) => {
    plugin.addTab({
        'type': args.id,
        init(this: Custom) {
            args.render(this.element as HTMLElement);
        },
        beforeDestroy() {
            args.destroyCb();
        }
    });
    openTab({
        app: plugin.app,
        custom: {
            title: args.title || 'Custom Tab',
            icon: 'iconEmoji',
            id: 'sy-f-misc' + args.id,
        }
    });
}
