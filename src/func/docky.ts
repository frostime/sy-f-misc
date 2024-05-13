import { Protyle, Dialog, showMessage, openTab } from "siyuan";
import type FMiscPlugin from "@/index";
import { html2ele } from "@/utils";
import { insertStyle, removeStyle } from "@/utils/style";
// import * as api from '../api';

export const selectIconDialog = () => {
    const symbols = document.querySelectorAll('symbol');
    const html = `
    <div class="icons" style="margin: 10px;">
        ${Array.from(symbols).map(symbol => {
            return `<svg style="width: 20px; height: 20px; padding: 5px; cursor: pointer;"><use xlink:href="#${symbol.id}"></use></svg>`
        }).join('\n')}
    </div>
    `;
    const dialog = new Dialog({
        title: '选择图标',
        content: html,
        width: '500px',
        height: '400px',
    });
    dialog.element.querySelector('.icons').addEventListener('click', (e) => {
        const target = e.target as SVGElement;
        let icon = '';
        if (target.tagName === 'svg') {
            icon = target.querySelector('use').getAttribute('xlink:href').replace('#', '');
        } else if (target.tagName === 'use') {
            icon = target.getAttribute('xlink:href').replace('#', '');
        } else {
            return;
        }
        navigator.clipboard.writeText(icon).then(() => {
            showMessage(`复制到剪贴板: #${icon}`, 2000);
        });
    });
}

const initDockPanel = (id: BlockId, ele: HTMLElement, plugin: FMiscPlugin) => {
    const div = document.createElement('div');
    div.className = 'docky-panel-body';
    div.dataset.nodeId = id;
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

    let html = `
    <div class="f-misc__docky-action">
        <svg data-name="focus">
            <use xlink:href="#iconFocus"></use>
        </svg>
    </div>
    `;
    let frag = html2ele(html);
    frag.querySelector('svg').addEventListener('click', () => {
        openTab({
            app: plugin.app,
            doc: {
                id: id,
                zoomIn: true
            }
        })
    });

    ele.appendChild(div);
    ele.appendChild(frag);
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
        type: '_docky_' + dock.id,
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

// const addedBlocks: string[] = [];

export let name = "Docky";
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

    let enable = plugin.getConfig('Docky', 'DockyEnableZoom');
    let factor = plugin.getConfig('Docky', 'DockyZoomFactor');
    if (enable === false) {
        document.documentElement.style.setProperty('--plugin-docky-zoom', 'unset');
    } else {
        document.documentElement.style.setProperty('--plugin-docky-zoom', `${factor}`);
    }

    insertStyle('f-misc-docky-style', `
        .f-misc__docky-action {
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            display: flex;
            position: absolute;
            right: 5px;
            top: 5px;
            padding: 5px 5px;
            border-radius: 5px;
            background: var(--b3-theme-surface-light);
            color: var(--b3-toolbar-color);
        }
        .f-misc__docky-action:hover {
            opacity: 1;
        }

        .f-misc__docky-action>svg {
            width: 15px;
            height: 15px;
            cursor: pointer;
        }
    `);

    enabled = true;
}

export const unload = () => {
    if (!enabled) return;
    removeStyle('f-misc-docky-style');
    enabled = false;
}
