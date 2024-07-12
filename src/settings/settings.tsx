import { Component, For, createEffect, createSignal, onCleanup } from "solid-js";
import SettingPanel from "@/libs/components/setting-panel";
import SettingItemWrap from "@/libs/components/item-wrap";
import { getAlive } from "@/func/websocket";
import { Dynamic } from "solid-js/web";

const groups: { key: string, text: string }[] = [
    { key: 'Enable', text: '✅ 启用功能' },
    { key: 'Docky', text: '⛩️ 侧边栏显示' },
    { key: 'Misc', text: '🔧 其他设置' }
];

let timer = null;

const WebSocketStatus: Component = () => {
    let [alive, setAlive] = createSignal(false);
    if (timer) clearInterval(timer);
    setAlive(getAlive());
    timer = setInterval(() => {
        setAlive(getAlive());
        console.debug('Websocket Alive:', alive?.());
    }, 1000 * 5);
    //onCleanup 无法正常调用，先用这个顶一顶
    setTimeout(() => {
        clearInterval(timer);
    }, 1000 * 30);

    //BUG 在 MISC 页面直接退出 dialog，会无法调用 onCleanup
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
    changed: (e: IChangeEvent) => void
}


const App: Component<IArgs> = (props) => {
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
                description="当前 Websocket 的运行状态 (目前只跟踪 30s)"
            >
                <WebSocketStatus/>
            </SettingItemWrap>
        </SettingPanel>
    );

    const showGroups = {
        Enable,
        Docky,
        Misc
    }

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