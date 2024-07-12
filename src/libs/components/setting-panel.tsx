// Copyright (c) 2023 by frostime All Rights Reserved.
// Author       : frostime
// Date         : 2023-07-01 19:23:50
// FilePath     : /src/libs/setting-panel.tsx
// LastEditTime : 2024-06-08 18:25:34
// Description  :

import { Component, For, JSXElement, children } from "solid-js";
import ItemWrap from "./item-wrap";
import InputItem from "./item-input";

interface SettingPanelProps {
    group: string;
    settingItems: ISettingItem[];
    // display: boolean;
    onChanged: (e: { group: string, key: string, value: any }) => void;
    children?: JSXElement
}

const SettingPanel: Component<SettingPanelProps> = (props) => {
    // const fn__none = createMemo(() => props.display === true ? "" : "fn__none");
    const useChildren = children(() => props.children);

    return (
        <div class={`config__tab-container`} data-name={props.group}>
            <For each={props.settingItems}>
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
                            changed={(v) => props.onChanged({ group: props.group, key: item.key, value: v })}
                        />
                    </ItemWrap>
                )}
            </For>
            {useChildren()}
        </div>
    );
};

export default SettingPanel;
