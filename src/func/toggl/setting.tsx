/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-10-10 20:33:25
 * @FilePath     : /src/func/toggl/setting.tsx
 * @LastEditTime : 2024-12-19 14:23:16
 * @Description  : 
 */
/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 13:23:39
 * @FilePath     : /src/func/toggl/setting.tsx
 * @LastEditTime : 2024-10-09 15:56:46
 * @Description  : 
 */
// Copyright (c) 2023 by frostime All Rights Reserved.
// Author       : frostime
// Date         : 2023-07-01 19:23:50
// FilePath     : /src/libs/setting-panel.tsx
// LastEditTime : 2024-06-08 18:25:34
// Description  :

// import { Component, For, JSXElement, children } from "solid-js";
import Form from "@/libs/components/Form";
import { config, setConfig, save } from "./state";
import * as store from './state';
import { createSignal, onCleanup, Show } from "solid-js";
// import type FMiscPlugin from "@/index";
// import { User } from "./api/types";
import { getMe } from "./api/me";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";

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

    // const plugin = getPlugin();
    const plugin = thisPlugin();

    onCleanup(() => {
        save(plugin);
    });

    const descDeviceID = (): string => {
        if (config.topDevice === window.siyuan.config.system.id) {
            // return (<span style={{ color: 'var(--b3-theme-primary' }}>当前设备!将执行自动获取。</span>)
            return `<span style="color: var(--b3-theme-primary);">当前设备!将执行自动获取。</span>`;
        } else {
            // return <span style={{ color: 'var(--b3-theme-primary' }}>非当前设备，将不会实际执行自动获取！</span>
            return `<span style="color: var(--b3-theme-primary);">非当前设备，将不会实际执行自动获取！</span>`;
        }
    }

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
                style={{ "max-height": "150px", "overflow": "auto" }}
            >
                <DisplayRecord record={store.me()} />
            </Form.Wrap>
            <Form.Wrap
                title="笔记本"
                description="填入笔记本 ID，toggl 日志将会写入对应笔记本的 daily note 当中"
            >
                <Form.Input
                    type="textinput"
                    key="box"
                    value={config.dailynoteBox}
                    placeholder="Please enter notebook ID"
                    changed={(v) => {
                        setConfig('dailynoteBox', v);
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="是否自动获取 Toggle 记录"
                description="定时获取今天的 Toggle 记录，并写入 daily note 当中"
            >
                <Form.Input
                    type="checkbox"
                    key="autoFetch"
                    value={config.dnAutoFetch}
                    changed={(v) => {
                        setConfig('dnAutoFetch', v);
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="自动获取间隔"
                description="定时获取今天的 Toggle 记录的定时间隔 (分钟)"
            >
                <Form.Input
                    type="number"
                    key="autoFetchInterval"
                    value={config.dnAutoFetchInterval}
                    changed={(v) => {
                        setConfig('dnAutoFetchInterval', v);
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="优先在该设备上运行"
                description={descDeviceID()}
                direction="row"
                action={
                    <button class="button b3-button" onClick={() => {
                        setConfig('topDevice', window.siyuan.config.system.id);
                    }}>设置为当前设备</button>
                }
            >
                <Form.Input
                    type="textinput"
                    key=""
                    value={config.topDevice}
                    fn_size={false}
                    style={{ width: '100%' }}
                    changed={(v) => {
                        setConfig('topDevice', v);
                    }}
                />
            </Form.Wrap>
        </div>
    );
};

export default TogglSetting;
