import { Protyle, Dialog, showMessage, openTab } from "siyuan";
import type FMiscPlugin from "@/index";

import { deepMerge, html2ele } from "@frostime/siyuan-plugin-kits";
import { updateStyleDom, removeStyleDom } from "@frostime/siyuan-plugin-kits";
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

const initDockPanel = (docky: IDockyBlock, ele: HTMLElement, plugin: FMiscPlugin) => {
    const id: BlockId = docky.id;
    const protyleContainer = document.createElement('div');
    protyleContainer.className = 'docky-panel-body';
    protyleContainer.dataset.nodeId = id;
    protyleContainer.style.height = '100%';
    protyleContainer.style.width = '100%';
    new Protyle(plugin.app, protyleContainer, {
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
    <div class="f-misc__docky" style="width: 100%; height: 100%;">
        <div class="block__icons">
            <div class="block__logo">
                <svg class="block__logoicon">
                    <use xlink:href="#iconBookmark"></use>
                </svg>
                ${docky.name || 'Protyle'}
            </div>
            <span class="fn__flex-1"></span>
            <span data-type="focus" class="block__icon b3-tooltips b3-tooltips__w" aria-label="聚焦">
                <svg>
                    <use xlink:href="#iconFocus"></use>
                </svg>
            </span>
            <span class="fn__space"></span>
            <span data-type="min" class="block__icon b3-tooltips b3-tooltips__w" aria-label="最小化 Ctrl+W">
                <svg>
                    <use xlink:href="#iconMin"></use>
                </svg>
            </span>
        </div>
    </div>
    `;
    let frag = html2ele(html);
    frag.querySelector('span[data-type="focus"]')?.addEventListener('click', () => {
        openTab({
            app: plugin.app,
            doc: {
                id: id,
                zoomIn: true
            }
        })
    });

    frag.appendChild(protyleContainer);
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
            initDockPanel(dock, this.element, plugin)
        }
    })
}

// const addedBlocks: string[] = [];

export let name = "Docky";
export let enabled = false;
let configs = {
    DockyEnableZoom: true,
    DockyZoomFactor: 0.75,
    DockySelectIcon: '',
    DockyProtyle: '',
}
export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'Docky',
    load: (data: { DockyEnableZoom: boolean, DockyZoomFactor: number, DockySelectIcon: string, DockyProtyle: string }) => {
        configs = deepMerge(configs, data);
    },
    items: [
        {
            type: 'checkbox',
            title: '缩放 Protyle',
            description: '是否缩放侧边栏 Protyle',
            key: 'DockyEnableZoom',
            get: () => configs.DockyEnableZoom,
            set: (value: boolean) => {
                configs.DockyEnableZoom = value;
                if (value === false) {
                    document.documentElement.style.setProperty('--plugin-docky-zoom', 'unset');
                } else {
                    document.documentElement.style.setProperty('--plugin-docky-zoom', `${configs.DockyZoomFactor}`);
                }

            }
        },
        {
            type: 'slider',
            title: '缩放因子',
            description: '对 Protyle 缩放的 zoom 因子',
            key: 'DockyZoomFactor',
            get: () => configs.DockyZoomFactor,
            set: (value: number) => {
                if (typeof value === 'string') value = parseFloat(value);
                configs.DockyZoomFactor = value;
                document.documentElement.style.setProperty('--plugin-docky-zoom', `${value}`);
            },
            slider: {
                min: 0.5,
                max: 1,
                step: 0.01,
            }
        },
        {
            type: 'button',
            title: '选择图标',
            description: '选择图标',
            key: 'DockySelectIcon',
            get: () => configs.DockySelectIcon,
            set: (value: string) => {
                configs.DockySelectIcon = value;
            },
            button: {
                label: '选择图标',
                callback: selectIconDialog
            }
        },
        {
            type: 'textarea',
            title: 'Protyle 配置',
            description: `加入侧边栏的 Protyle, 用换行符分割<br/>e.g. id: xxx, name: xxx, position: xxx, icon?: xxx, hotkey?: xxx<br/>
            position: LeftTop | LeftBottom | RightTop | RightBottom | BottomLeft | BottomRight
            `,
            key: 'DockyProtyle',
            direction: 'row',
            get: () => configs.DockyProtyle,
            set: (value: string) => {
                configs.DockyProtyle = value;
            }
        },
    ]
}

export const declareToggleEnabled = {
    title: '🗳️ Docky',
    description: '启用 Docky 功能',
    defaultEnabled: true
};

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    // let protyles: string = plugin.getConfig('Docky', 'DockyProtyle');
    let protyles: string = configs.DockyProtyle;
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

    // let enable = plugin.getConfig('Docky', 'DockyEnableZoom');
    // let factor = plugin.getConfig('Docky', 'DockyZoomFactor');
    let enable = configs.DockyEnableZoom;
    let factor = configs.DockyZoomFactor;
    if (enable === false) {
        document.documentElement.style.setProperty('--plugin-docky-zoom', 'unset');
    } else {
        document.documentElement.style.setProperty('--plugin-docky-zoom', `${factor}`);
    }

    updateStyleDom('f-misc-docky-style', `
        .docky-panel-body.protyle {
            zoom: var(--plugin-docky-zoom);
            .protyle-wysiwyg {
                padding-left: 16px !important;
                padding-right: 16px !important;
            }
        }
    `);

    enabled = true;
}

export const unload = () => {
    if (!enabled) return;
    removeStyleDom('f-misc-docky-style');
    enabled = false;
}
