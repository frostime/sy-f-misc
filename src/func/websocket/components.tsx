import { Component, createSignal, onCleanup } from "solid-js";
import { getAlive } from ".";
import FormWrap from "@/libs/components/Form/form-wrap";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { currentHandlers, moduleJsName } from "./handlers";
import { FormInput } from "@/libs/components/Form";
import { showMessage } from "siyuan";
import { sharedConfigs } from "../shared-configs";

let timer = null;

let cp: any;
try {
    cp = window?.require('child_process');
} catch (e) {
    cp = null;
}

export const WebSocketStatus: Component = () => {
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

const example = `{
    channel: "sy-f-misc",
    message: { command: "<command-name>", body: "<command-argument>" }
}`.trim();
export const Configs = () => {
    const plugin = thisPlugin();
    const current = () => {
        // let names = Object.keys(currentHandlers);
        let names = [];
        Object.entries(currentHandlers).forEach(([key, handler]) => {
            if (handler) {
                names.push(key);
            }
        });
        return names.join(', ');
    }
    return (
        <>
            <FormWrap
                title="Websocket"
                description="当前 Websocket 的运行状态"
                direction="row"
                action={<WebSocketStatus />}
            >
                <div class="b3-label__text" style={{
                    display: 'inline-block'
                }} innerText={`向 /api/broadcast/postMessage 发送内核消息, 格式如下:`} />
                <pre style={{ margin: '0px' }}>
                    <code style={{ 'font-family': 'var(--b3-font-family-code)' }}>{example}</code>
                </pre>
                <div class="b3-label__text" style={{
                    display: 'inline-block'
                }} innerText={'Handlers: ' + current()} />
            </FormWrap>
            <FormWrap
                title="自定义消息处理函数"
                description={`编辑 /data/storage/petal/${plugin.name}/${moduleJsName} 文件`}
            >
                <FormInput
                    type="button"
                    button={{
                        label: '编辑',
                        callback: () => {
                            if (!cp) {
                                showMessage('非桌面端环境无法编辑代码', 3000, 'error');
                                return;
                            }
                            const dataDir = window.siyuan.config.system.dataDir;
                            const jsPath = `${dataDir}/storage/petal/${plugin.name}/${moduleJsName}`;
                            let editorCmd = sharedConfigs.codeEditor() + ' ' + jsPath;
                            try {
                                cp.exec(editorCmd);
                            } catch (error) {
                                showMessage(`打开编辑器失败: ${error.message}`, 3000, 'error');
                            }
                        }
                    }}
                />
            </FormWrap>
        </>
    )
}
