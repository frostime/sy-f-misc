// Copyright (c) 2023 by frostime All Rights Reserved.
// Author       : frostime
// Date         : 2023-07-01 19:23:50
// FilePath     : /src/libs/setting-panel.tsx
// LastEditTime : 2024-06-08 18:25:34
// Description  :

import { Component, createSignal, For, Show, JSXElement } from "solid-js";
import ItemWrap from "./item-wrap";
import InputItem from "./item-input";

interface SettingPanelProps {
    group: string;
    settingItems: ISettingItem[];
    display?: boolean;
    onChanged: (e: { group: string, key: string, value: any }) => void;
    children?: JSXElement
}

const SettingPanel: Component<SettingPanelProps> = (props) => {
    const { group, settingItems, display = true, onChanged } = props;
    const [fn__none, _] = createSignal(display ? "" : "fn__none");

    return (
        <Show when={display}>
            <div class={`config__tab-container ${fn__none()}`} data-name={group}>
                {props.children}
                <For each={settingItems}>
                    {(item) => (
                        <ItemWrap
                            title={item.title}
                            description={item.description}
                            direction={item?.direction}
                        >
                            <InputItem
                                type={item.type}
                                key={item.key}
                                value={item.value}
                                placeholder={item?.placeholder}
                                options={item?.options}
                                slider={item?.slider}
                                button={item?.button}
                                changed={(v) => onChanged({ group: group, key: item.key, value: v })}
                            />
                        </ItemWrap>
                    )}
                </For>
            </div>
        </Show>
    );
};

export default SettingPanel;
