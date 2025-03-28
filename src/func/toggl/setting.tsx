/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 13:23:39
 * @FilePath     : /src/func/toggl/setting.tsx
 * @LastEditTime : 2025-03-28 15:37:31
 * @Description  : 
 */

import Form from "@/libs/components/Form";
import { config, save, me as meRef } from "./state/config";
import { createSignal, onCleanup, Show } from "solid-js";

import { getMe } from "./api/me";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";

// #if [!PRIVATE_REMOVE]
import { updateMiniTimerUI } from "./components";
// #endif

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
    const [checkText, setCheckText] = createSignal(meRef() ? `✔️ 检查通过！用户: ${meRef().fullname}` : "请先检查用户信息");

    const updateAboutMe = async () => {
        const me = await getMe();
        if (!me || !me.ok) {
            setCheckText(`无法获取用户信息: code = ${me.status}`);
            meRef(null);
            return;
        }
        setCheckText(`✔️ 检查通过！用户: ${me.data.fullname}`);
        meRef(me.data);
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
        if (config().topDevice === window.siyuan.config.system.id) {
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
                        value={config().token}
                        placeholder="Please enter your Toggl API Token"
                        changed={(v) => {
                            config.update('token', v);
                            meRef(null);
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
                <DisplayRecord record={meRef()} />
            </Form.Wrap>
            <Form.Wrap
                title="笔记本"
                description="填入笔记本 ID，toggl 日志将会写入对应笔记本的 daily note 当中"
            >
                <Form.Input
                    type="textinput"
                    key="box"
                    value={config().dailynoteBox}
                    placeholder="Please enter notebook ID"
                    changed={(v) => {
                        config.update('dailynoteBox', v);
                    }}
                />
            </Form.Wrap>
            {/* #if [!PRIVATE_REMOVE] */}
            <Form.Wrap
                title="Mini Timer"
                description="在思源中显示当前正在运行的活动"
            >
                <Form.Input
                    type="select"
                    key="miniTimerType"
                    value={config().miniTimerType}
                    changed={(v) => {
                        if (config().miniTimerType === v) return;
                        config.update('miniTimerType', v);
                        updateMiniTimerUI();
                    }}
                    options={{
                        'none': "不显示",
                        'statusBar': "在状态栏显示",
                        'bubble': "在气泡显示"
                    }}
                />
            </Form.Wrap>
            {/* #endif */}
            <Form.Wrap
                title="是否自动获取 Toggle 记录"
                description="定时获取今天的 Toggle 记录，并写入 daily note 当中"
            >
                <Form.Input
                    type="checkbox"
                    key="autoFetch"
                    value={config().dnAutoFetch}
                    changed={(v) => {
                        config.update('dnAutoFetch', v);
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
                    value={config().dnAutoFetchInterval}
                    changed={(v) => {
                        config.update('dnAutoFetchInterval', v);
                    }}
                />
            </Form.Wrap>
            <Form.Wrap
                title="仅在该设备上进行自动运行以避免多设备冲突"
                description={descDeviceID()}
                direction="row"
                action={
                    <button class="button b3-button" onClick={() => {
                        config.update('topDevice', window.siyuan.config.system.id);
                    }}>设置为当前设备</button>
                }
            >
                <Form.Input
                    type="textinput"
                    key=""
                    value={config().topDevice}
                    fn_size={false}
                    style={{ width: '100%' }}
                    changed={(v) => {
                        config.update('topDevice', v);
                    }}
                />
            </Form.Wrap>
        </div>
    );
};

export default TogglSetting;
