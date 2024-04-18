import { Protyle } from "siyuan";
import type FMiscPlugin from "@/index";
// import * as api from '../api';

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

const BlockIDPattern = /^\d{14,}-\w{7}$/;
/**
 * 根据配置规则解析 Protyle
 * @param line e.g. id: xxx, name: xxx, position: xxx, icon?: xxx, hotkey?: xxx
 */
const parseProtyle = (line: string): IDockyBlock => {
    const tokens = line.split(',');
    const block: IDockyBlock = {
        id: null,
        name: null,
        position: 'LeftBottom',
        icon: 'iconEmoji',
        hotkey: undefined,
    };
    tokens.forEach(token => {
        const [key, value] = token.split(':').map(s => s.trim());
        if (key === 'id') {
            //check match
            if (!value.match(BlockIDPattern)) return;

            block.id = value;
        } else if (key === 'name') {
            block.name = value;
        } else if (key === 'position') {
            if (['LeftTop', 'LeftBottom', 'RightTop', 'RightBottom'].includes(value)) {
                //@ts-ignore
                block.position = value;
            }
        } else if (key === 'icon') {
            block.icon = value;
        } else if (key === 'hotkey') {
            block.hotkey = value;
        }
    });
    //check
    if (!block.id || !block.name) {
        return null;
    }

    return block;
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
    let protyles: string = plugin.getConfig('Docky', 'DockyProtyle');
    let lines = protyles.split('\n');
    lines.forEach(line => {
        if (line.trim() === '') return;
        let block = parseProtyle(line);
        if (block) {
            addToDock(plugin, block);
        } else {
            console.warn(`Not a valid protyle rule: ${line}`)
        }
    });
    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    
    enabled = false;
}