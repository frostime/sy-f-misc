import { Component, For, JSX, Show, createSignal, onCleanup, onMount } from "solid-js";
import SettingPanel from "@/libs/components/setting-panel";

import Form from '@/libs/components/Form';

// import TogglSetting from "@/func/toggl/setting";
import { Dynamic } from "solid-js/web";


/**
 * 外部元素包装组件
 * 支持 JSX.Element、HTMLElement 或 ExternalElementWithDispose
 */
const ExternalElementWrapper: Component<{
    element: () => FlexibleElement
}> = (props) => {
    const result = props.element();

    // JSX 元素直接返回
    if (!(result instanceof HTMLElement) &&
        !(typeof result === 'object' && result !== null && 'element' in result)) {
        return result as JSX.Element;
    }

    // 处理 HTMLElement
    let containerRef: HTMLDivElement;

    onMount(() => {
        const element = result instanceof HTMLElement ? result : result.element;
        const dispose = result instanceof HTMLElement ? undefined : result.dispose;

        containerRef.appendChild(element);

        onCleanup(() => {
            dispose?.();
            element.remove();
        });
    });

    return <div ref={containerRef} style={{ display: 'contents' }} />;
};


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
        element: () => FlexibleElement;
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
                                        number={item?.number}
                                        changed={(v) => item.set(v)}
                                        style={item?.direction === 'row' ? { width: '100%' } : null}
                                    />
                                </Form.Wrap>
                            )}
                        </For>
                        <Show when={config.customPanel}>
                            <ExternalElementWrapper element={config.customPanel!} />
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
        showGroups[panel.key] = () => (
            <ExternalElementWrapper element={panel.element} />
        );
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