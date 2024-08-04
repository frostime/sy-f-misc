/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-03 22:00:08
 * @FilePath     : /src/libs/open-tab.ts
 * @LastEditTime : 2024-08-03 22:02:30
 * @Description  : 
 */
import { ITabModel, openTab, type Plugin } from "siyuan";
export const openCustomTab = (plugin: Plugin, args: {
    id: string,
    render: (container: HTMLElement) => void,
    destroyCb: () => void,

}) => {
    plugin.addTab({
        'type': args.id,
        init(this: ITabModel) {
            args.render(this.element);
        },
        destroy() {
            args.destroyCb();
        }
    });
    openTab({
        app: plugin.app,
        custom: {
            title: 'TestAPI',
            icon: 'iconBug',
            id: 'sy-f-misc' + args.id,
        }
    });
}
