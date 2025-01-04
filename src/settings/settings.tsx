import { Component, For, JSX, Show, createSignal, onCleanup } from "solid-js";
import SettingPanel from "@/libs/components/setting-panel";

import Form, { FormWrap as SettingItemWrap } from '@/libs/components/Form';

// import TogglSetting from "@/func/toggl/setting";
import { Dynamic } from "solid-js/web";


/********** Events **********/
interface IChangeEvent {
    group: string;
    key: string;
    value: any;
}

interface IArgs {
    GroupEnabled: ISettingItem[];
    GroupMisc: ISettingItem[];
    changed: (e: IChangeEvent) => void;
    customPanels?: {
        key: string;
        title: string;
        element: () => JSX.Element;
    }[];
    customModuleConfigs?: IFuncModule['declareModuleConfig'][];
}


const App: Component<IArgs> = (props) => {
    let groups: { key: string, text: string }[] = [
        { key: 'Enable', text: '✅ 启用功能' },
        { key: 'Misc', text: '🔧 其他设置' },
        // { key: 'Toggl', text: '⏲️ Toggl' }
    ];

    props.customPanels?.forEach(panel => {
        groups.push({
            key: panel.key,
            text: panel.title,
        });
    });

    let [focus, setFocus] = createSignal(groups[0].key);

    const changed = props.changed;

    onCleanup(() => {
        console.log("Setting Pannel Clearup");
    });

    const Enable = () => (
        <SettingPanel
            group={groups[0].key}
            settingItems={props.GroupEnabled}
            onChanged={changed}
        />
    );

    const Misc = () => (
        <SettingPanel
            group={groups[2].key}
            settingItems={props.GroupMisc}
            onChanged={changed}
        >
            <CustomModuleConfigs />
        </SettingPanel>
    );

    const CustomModuleConfigs = () => (
        <>
            <For each={props.customModuleConfigs || []}>
                {(config) => (
                    <div style={{
                        margin: '5px 24px',
                        padding: '5px 0',
                        "border-radius": 0,
                        'border': '1px solid var(--b3-theme-primary)',
                    }}>
                        <h3 style={{
                            padding: '5px 0',
                            "text-align": 'center',
                            color: 'var(--b3-theme-primary)',
                            "border-radius": 0,
                            'border-bottom': '1px dashed var(--b3-theme-primary)',
                        }}>
                            {config.title || config.key}
                        </h3>
                        <For each={config.items ?? []}>
                            {(item) => (
                                <Form.Wrap
                                    title={item.title}
                                    description={item.description}
                                    direction={item?.direction}
                                >
                                    <Form.Input
                                        type={item.type}
                                        key={item.key}
                                        value={item.get()}
                                        placeholder={item?.placeholder}
                                        options={item?.options}
                                        slider={item?.slider}
                                        button={item?.button}
                                        changed={(v) => item.set(v)}
                                        style={item?.direction === 'row' ? { width: '100%' } : null}
                                    />
                                </Form.Wrap>
                            )}
                        </For>
                        <Show when={config.customPanel}>
                            {config.customPanel()}
                        </Show>
                    </div>
                )}
            </For>
        </>
    )

    let showGroups = {
        Enable,
        Misc,
    }

    props.customPanels?.forEach(panel => {
        showGroups[panel.key] = panel.element;
    });

    return (
        <>
            <div class="fn__flex-1 fn__flex config__panel" style={{ "height": "100%" }}>
                <ul class="b3-tab-bar b3-list b3-list--background">
                    <For each={groups}>
                        {(group: { key: string, text: string }) => (
                            <li
                                data-name="editor"
                                class={`b3-list-item${group.key === focus() ? " b3-list-item--focus" : ""}`}
                                style="padding-left: 1rem"
                                onClick={() => setFocus(group.key)}
                                onKeyDown={() => { }}
                            >
                                <span class="b3-list-item__text">{group.text}</span>
                            </li>
                        )}
                    </For>
                </ul>
                <div class="config__tab-wrap">
                    <Dynamic component={showGroups[focus()]} />
                </div>
            </div>
        </>
    );
}

export default App;