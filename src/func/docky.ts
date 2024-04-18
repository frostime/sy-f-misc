import { Protyle } from "siyuan";
import type FMiscPlugin from "@/index";
import * as api from '../api';

const Test = {
    async randomBlock() {
        const sql = 'select * from blocks order by random() limit 1';
        const res = await api.sql(sql);
        return res[0];
    }
}

const initDockPanel = (id: BlockId, ele: HTMLElement, plugin: FMiscPlugin) => {
    const div = document.createElement('div');
    div.className = 'docky-panel-body';
    div.style.height = '100%';
    div.style.width = '100%';
    new Protyle(plugin.app, div, {
        action: ['cb-get-all'],
        blockId: id,
        render: {
            background: false,
            title: false,
            gutter: true,
            scroll: false,
            breadcrumb: false,
            breadcrumbDocName: false,
        }
    });
    ele.appendChild(div);
}

const addToDock = (plugin: FMiscPlugin, dock: IDockyBlock) => {
    plugin.addDock({
        type: 'docky' + dock.id,
        config: {
            position: dock.position || 'LeftBottom',
            size: {
                width: 200,
                height: 200,
            },
            icon: dock.icon || 'iconEmoji',
            title: dock.name || 'Docky:' + dock.id,
            hotkey: dock.hotkey || undefined,
        },
        data: {
            blockId: dock.id,
            plugin: this,
        },
        init() {
            initDockPanel(dock.id, this.element, plugin)
        }
    })
}

export let name = "";
export let enabled = false;
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;
    let randomBlock = await Test.randomBlock();
    addToDock(plugin, {
        id: randomBlock.id,
        name: '随机Block',
        position: 'LeftBottom',
    });
    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    
    enabled = false;
}