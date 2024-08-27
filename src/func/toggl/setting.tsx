// Copyright (c) 2023 by frostime All Rights Reserved.
// Author       : frostime
// Date         : 2023-07-01 19:23:50
// FilePath     : /src/libs/setting-panel.tsx
// LastEditTime : 2024-06-08 18:25:34
// Description  :

// import { Component, For, JSXElement, children } from "solid-js";
import Form from "@/libs/components/Form";
import { config, setConfig, save } from "./store";
import * as store from './store';
import { createSignal, onCleanup, Show } from "solid-js";
// import type FMiscPlugin from "@/index";
// import { User } from "./api/types";
import { getMe } from "./api/me";
import { getPlugin } from "@/utils";

const DisplayRecord = (props: { record: Record<string, any> }) => {
    return (
        <Show when={props.record}>
            <div style={{ display: "flex", gap: "3px", "flex-direction": "column", padding: "5px" }}>
                {
                    Object.entries(props.record).map(([key, value]) => (
                        <div style={{ display: "flex", gap: "3px", "align-items": "center" }}>
                            <span style={{ "font-weight": "bold", flex: 1 }}>{key}:</span>
                            <span style={{ "text-align": "right" }}>{value}</span>
                        </div>
                    ))
                }
            </div>
        </Show>
    )
}

const useAboutMe = () => {
    const [checkText, setCheckText] = createSignal(store.me() ? `✔️ 检查通过！用户: ${store.me().fullname}` : "请先检查用户信息");

    const updateAboutMe = async () => {
        const me = await getMe();
        if (!me || !me.ok) {
            setCheckText(`无法获取用户信息: code = ${me.status}`);
            store.setMe(null);
            return;
        }
        setCheckText(`✔️ 检查通过！用户: ${me.data.fullname}`);
        store.setMe(me.data);
    }

    return {
        checkText,
        updateAboutMe,
        tobeCheck: () => {
            setCheckText("请先检查用户信息");
        }
    }

}

const TogglSetting = () => {

    const { checkText, updateAboutMe, tobeCheck } = useAboutMe();

    const plugin = getPlugin();

    onCleanup(() => {
        save(plugin);
    });

    return (
        <div class={`config__tab-container`} data-name="toggl">
            <Form.Wrap
                title="API Token"
                description={`You can find your Toggl API Token in <a href="https://track.toggl.com/profile">Profile Page</a>`}
                direction="row"
            >
                <div style={{ display: "flex", flex: 1, gap: "10px" }}>
                    <Form.Input
                        type="textinput"
                        key="token"
                        value={config.token}
                        placeholder="Please enter your Toggl API Token"
                        changed={(v) => {
                            setConfig('token', v);
                            store.setMe(null);
                            tobeCheck();
                        }}
                        style={{ flex: 1 }}
                    />
                    <button class="button b3-button" onClick={updateAboutMe}>Check</button>
                </div>
            </Form.Wrap>
            <Form.Wrap
                title="用户检查状态"
                description={checkText()}
                direction="row"
            >
                <DisplayRecord record={store.me()} />
            </Form.Wrap>
        </div>
    );
};

export default TogglSetting;
