import { Protyle, openTab } from "siyuan";
import type FMiscPlugin from "@/index";

import { deepMerge, html2ele } from "@frostime/siyuan-plugin-kits";
import { updateStyleDom, removeStyleDom } from "@frostime/siyuan-plugin-kits";
import { selectIconDialog } from "@/libs/dialog";
import { Div } from "@/libs/components/solid-component-wrapper";
import { ButtonInput, SelectInput, TextInput } from "@/libs/components/Elements";
import { Cols, LeftRight, Rows } from "@/libs/components/Elements/Flex";
import { LabelText } from "@/libs/components/Elements/LabelText";
import { For, JSX, onCleanup } from "solid-js";
import { createStoreRef } from "@frostime/solid-signal-ref";
import SvgSymbol from "@/libs/components/Elements/IconSymbol";
// import * as api from '../api';

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
            <span data-type="focus" class="block__icon b3-tooltips b3-tooltips__w popover__block" data-id="${id}" aria-label="聚焦">
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


const createDockyProtyleListEditor = (options: {
    get: () => IDockyBlock[];
    set: (value: IDockyBlock[]) => void;
}): JSX.Element => {
    const initial = Array.isArray(options.get()) ? options.get().map(item => ({ ...item })) : [];
    // const [list, setList] = createSignal<IDockyBlock[]>(initial);
    const dockyList = createStoreRef<IDockyBlock[]>(initial);

    // const iconSymbol = (index: number) => {
    //     return SvgSymbol({
    //         children: dockyList()[index].icon,
    //         size: '1.5em',
    //     });
    // }
    const iconSymbol = (index: number) => {
        return SvgSymbol({
            get children() {  // 使用 getter 确保响应式生效
                return dockyList()[index].icon;
            },
            size: '1.5em',
        });
    }


    const commit = () => {
        dockyList.update((old) => {
            return old.filter(item => item.id && item.name);
        });
        options.set(structuredClone(dockyList.unwrap()));
    }

    onCleanup(() => {
        commit();
    });

    const addItem = () => {
        dockyList.update(old => [...old, {
            id: '',
            name: '',
            position: 'LeftBottom',
            icon: '',
            hotkey: undefined,
        }]);
        // options.set(structuredClone(dockyList.unwrap()));
    };

    const updateItem = (index: number, patch: Partial<IDockyBlock>) => {
        // const next = list().map((item, i) => i === index ? ({ ...item, ...patch }) : item);
        // commit(next);
        dockyList.update(index, item => ({ ...item, ...patch }));
        // options.set(structuredClone(dockyList.unwrap()));
    };

    const removeItem = (index: number) => {
        // const next = dockyList().filter((_, i) => i !== index);
        // commit(next);
        dockyList.update(old => old.filter((_, i) => i !== index));
        // options.set(structuredClone(dockyList.unwrap()));
    };
    // "RightTop" | "RightBottom" | "LeftTop" | "LeftBottom"
    const positionOptions: Record<string, string> = {
        LeftTop: '左上',
        LeftBottom: '左下',
        RightTop: '右上',
        RightBottom: '右下',
    };

    const Group = (props: {
        style?: JSX.CSSProperties,
        label: JSX.Element,
        widget: JSX.Element,
    }) => {
        return Cols({
            gap: '4px',
            align: 'center',
            style: { ...props.style },
            children: [props.label, props.widget]
        });
    }


    const items = () => {
        const L = (text: string) => LabelText({
            text,
            preset: 'outlined',
            fontSize: '12px',
            style: {
                padding: '2px 6px',
                'white-space': 'nowrap',
                color: 'var(--b3-theme-on-surface)',
            }
        });
        return For({
            each: dockyList(),
            children: (item, index) => (
                Div({
                    style: {
                        padding: '8px',
                        border: '1px solid var(--b3-border-color)',
                        'border-radius': '6px',
                        background: 'var(--b3-theme-background)',
                    },
                    children: LeftRight({
                        gap: '12px',
                        align: 'center',
                        containerStyle: { width: '100%' },
                        leftStyle: { flex: '1' },
                        left: Cols({
                            gap: '5px',
                            // style: { width: '100%', 'flex-wrap': 'wrap' },
                            align: 'center',
                            justify: 'space-between',
                            children: [
                                Group({
                                    // style: { width: '150px' },
                                    label: L('id'),
                                    widget: TextInput({
                                        value: item.id || '',
                                        placeholder: '块 ID',
                                        style: {
                                            flex: 1,
                                            'max-width': '175px',
                                        },
                                        onChanged: (v) => updateItem(index(), { id: v.trim() }),
                                    })
                                }),
                                Group({
                                    // style: { width: '100px' },
                                    label: L('name'),
                                    widget: TextInput({
                                        value: item.name || '',
                                        placeholder: '名称',
                                        style: {
                                            flex: 1,
                                            'max-width': '125px',
                                        },
                                        onChanged: (v) => updateItem(index(), { name: v.trim() }),
                                    })
                                }),
                                Group({
                                    // style: { width: '70px' },
                                    label: L('位置'),
                                    widget: SelectInput({
                                        value: item.position || 'LeftBottom',
                                        options: positionOptions,
                                        style: {
                                            flex: 1,
                                            'max-width': '80px',
                                        },
                                        changed: (v) => updateItem(index(), { position: v as IDockyBlock['position'] }),
                                    })
                                }),

                                Group({
                                    // style: { width: '100px' },
                                    label: ButtonInput({
                                        label: 'Icon',
                                        classText: true,
                                        classSmall: true,
                                        onClick: () => {
                                            selectIconDialog((v) => {
                                                updateItem(index(), { icon: v.trim() });
                                            });
                                        }
                                    }),
                                    widget: iconSymbol(index())
                                }),
                                Group({
                                    // style: { width: '100px' },
                                    label: L('hotkey'),
                                    widget: TextInput({
                                        value: item.hotkey || '',
                                        placeholder: '可选',
                                        onChanged: (v) => updateItem(index(), { hotkey: v.trim() === '' ? undefined : v.trim() }),
                                        style: {
                                            // width: '100%',
                                            'max-width': '120px',
                                        },
                                    })
                                }),
                            ]
                        }),
                        right: ButtonInput({
                            label: '删除',
                            classOutlined: true,
                            onClick: () => removeItem(index()),
                        }),
                    })
                })
            )
        })
    }

    return (
        Div({
            style: {
                width: '100%',
                display: 'flex',
                'flex-direction': 'column',
                gap: '8px',
            },
            children: [
                LeftRight({
                    left: LabelText({
                        text: '管理侧栏 Protyle 列表',
                        fontSize: '14px', preset: 'bare'
                    }),
                    right: ButtonInput({
                        label: '新增',
                        classOutlined: true,
                        onClick: addItem,
                        style: { 'margin-right': '9px' },
                    }),
                    containerStyle: { width: '100%' },
                }),
                Rows({
                    gap: '8px',
                    align: 'stretch',
                    justify: 'flex-start',
                    style: { width: '100%' },
                    children: items(),
                })
            ]
        })
    )
}
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
        type: '_docky_' + dock.id + '_' + dock.position,
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
            initDockPanel(dock, (this.element as HTMLElement), plugin)
        }
    })
}

// const addedBlocks: string[] = [];

export let name = "Docky";
export let enabled = false;
let configs = {
    schema: 2,
    DockyEnableZoom: true,
    DockyZoomFactor: 0.75,
    DockySelectIcon: '',
    /**
     * @deprecated
     */
    DockyProtyle: '',
    /**
     * Replace of `DockyProtyle`
     */
    DockyProtyleList: [] as IDockyBlock[],
}

const _migrate = (config: typeof configs) => {
    if (!config.schema || config.schema < 2) {
        console.debug('Migrating Docky config to schema v2');
        config.schema = 2;
        if (!config.DockyProtyleList && config.DockyProtyle) {
            let protyles: string = config.DockyProtyle;
            let lines = protyles.split('\n');
            let list: IDockyBlock[] = [];
            lines.forEach(line => {
                if (line.trim() === '') return;
                let block = parseProtyle(line);
                if (block) {
                    list.push(block);
                } else {
                    console.warn(`Not a valid protyle rule: ${line}`)
                }
            });
            config.DockyProtyleList = list;
        }
    }
    return config;
}


export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'Docky',
    load: (data: { DockyEnableZoom: boolean, DockyZoomFactor: number, DockySelectIcon: string, DockyProtyle: string, DockyProtyleList?: IDockyBlock[] }) => {
        // @ts-ignore
        data = _migrate(data);
        configs = deepMerge(configs, data);
    },
    dump: () => {
        return { ...configs };
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
        // {
        //     type: 'textarea',
        //     title: 'Protyle 配置（旧版）',
        //     description: `加入侧边栏的 Protyle, 用换行符分割<br/>e.g. id: xxx, name: xxx, position: xxx, icon?: xxx, hotkey?: xxx<br/>
        //     position: LeftTop | LeftBottom | RightTop | RightBottom
        //     `,
        //     key: 'DockyProtyle',
        //     direction: 'row',
        //     get: () => configs.DockyProtyle,
        //     set: (value: string) => {
        //         configs.DockyProtyle = value;
        //     }
        // },
        {
            type: 'custom',
            title: 'Protyle 配置',
            description: '',
            key: 'DockyProtyleList',
            direction: 'row',
            get: () => configs.DockyProtyleList,
            set: (value: IDockyBlock[]) => {
                if (!Array.isArray(value)) return;
                configs.DockyProtyleList = [...value];
            },
            custom: () => createDockyProtyleListEditor({
                get: () => configs.DockyProtyleList,
                set: (value: IDockyBlock[]) => {
                    // setting 会劫持 item.set 方法实现自动保存, 所以需要复用
                    declareModuleConfig.items[3].set(value);
                }
            }),
        }
    ]
}

export const declareToggleEnabled = {
    title: '🗳️ Docky',
    description: '启用 Docky 功能',
    defaultEnabled: true
};


export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;

    //#if [IS_DEV]
    console.debug('初始化 Docky ， 当前配置', configs);
    //#endif
    configs.DockyProtyleList.forEach(block => {
        if (!block || !block.id || !block.name) return;
        if (!block.id.match(BlockIDPattern)) {
            console.warn(`Docky: invalid block id: ${block.id}`);
            return;
        }
        //#if [IS_DEV]
        console.debug('Adding docky block from config:', block);
        //#endif
        addToDock(plugin, block);
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
