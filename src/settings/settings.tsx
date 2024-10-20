import { Component, For, JSX, createSignal, onCleanup } from "solid-js";
import SettingPanel from "@/libs/components/setting-panel";

import { FormWrap as SettingItemWrap } from '@/libs/components/Form';

import { getAlive } from "@/func/websocket";
// import TogglSetting from "@/func/toggl/setting";
import { Dynamic } from "solid-js/web";

let timer = null;

const WebSocketStatus: Component = () => {
    let [alive, setAlive] = createSignal(false);
    if (timer) clearInterval(timer);
    setAlive(getAlive());
    timer = setInterval(() => {
        setAlive(getAlive());
        console.debug('Websocket Alive:', alive?.());
    }, 1000 * 5);

    onCleanup(() => {
        console.log("WebSokect Status Clearup");
        clearInterval(timer);
        timer = null;
    });
    return <span class="b3-label">
        {alive() ? "🟢" : "🔴"}
    </span>
}


/********** Events **********/
interface IChangeEvent {
    group: string;
    key: string;
    value: any;
}

interface IArgs {
    GroupEnabled: ISettingItem[];
    GroupDocky: ISettingItem[];
    GroupMisc: ISettingItem[];
    changed: (e: IChangeEvent) => void;
    customPanels?: {
        key: string;
        title: string;
        element: () => JSX.Element;
    }[];
}


const App: Component<IArgs> = (props) => {
    let groups: { key: string, text: string }[] = [
        { key: 'Enable', text: '✅ 启用功能' },
        { key: 'Docky', text: '⛩️ 侧边栏显示' },
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

    const Docky = () => (
        <SettingPanel
            group={groups[1].key}
            settingItems={props.GroupDocky}
            onChanged={changed}
        />
    );

    const Misc = () => (
        <SettingPanel
            group={groups[2].key}
            settingItems={props.GroupMisc}
            onChanged={changed}
        >
            <SettingItemWrap
                title="Websocket 状态"
                description="当前 Websocket 的运行状态"
            >
                <WebSocketStatus/>
            </SettingItemWrap>
        </SettingPanel>
    );

    let showGroups = {
        Enable,
        Docky,
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
                    <Dynamic component={showGroups[focus()]}/>
                </div>
            </div>
        </>
    );
}

export default App;