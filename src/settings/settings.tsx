import { Component, For, createSignal } from "solid-js";
import SettingPanel from "@/libs/components/setting-panel";

const groups: {key: string, text: string}[] = [
    {key: 'Enable', text: '✅ 启用功能'},
    {key: 'Docky', text: '⛩️ 侧边栏显示'},
    {key: 'Misc', text: '🔧 其他设置'}
];


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

    return (
    <>
        <div class="fn__flex-1 fn__flex config__panel" style={{"height": "100%"}}>
            <ul class="b3-tab-bar b3-list b3-list--background">
                <For each={groups}>
                    {(group: {key: string, text: string}) => (
                        <li
                            data-name="editor"
                            class={`b3-list-item${group.key === focus() ? " b3-list-item--focus" : ""}`}
                            style="padding-left: 1rem"
                            onClick={() => setFocus(group.key)}
                            onKeyDown={() => {}}
                        >
                            <span class="b3-list-item__text">{group.text}</span>
                        </li>
                    )}
                </For>
            </ul>
            <div class="config__tab-wrap">
                <SettingPanel
                    group={groups[0].key}
                    settingItems={props.GroupEnabled}
                    display={focus() === groups[0].key}
                    onChanged={changed}
                />
                <SettingPanel
                    group={groups[1].key}
                    settingItems={props.GroupDocky}
                    display={focus() === groups[1].key}
                    onChanged={changed}
                />
                <SettingPanel
                    group={groups[2].key}
                    settingItems={props.GroupMisc}
                    display={focus() === groups[2].key}
                    onChanged={changed}
                />
            </div>
        </div>
    </>
    );
}

export default App;