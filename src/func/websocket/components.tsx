import { Component, createSignal, onCleanup } from "solid-js";
import { getAlive } from ".";
import FormWrap from "@/libs/components/Form/form-wrap";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { moduleJsName } from "./handlers";

let timer = null;

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
    return (
        <>
            <FormWrap
                title="Websocket 状态"
                description="当前 Websocket 的运行状态"
            >
                <WebSocketStatus />
            </FormWrap>
            <FormWrap
                title="自定义消息处理函数"
                description={`编辑 /data/storage/petal/${plugin.name}/${moduleJsName} 文件，并向 /api/broadcast/postMessage 发送内核消息, 格式如下:`}
                direction="row"
            >
                <pre>
                    <code style={{ 'font-family': 'var(--b3-font-family-code)' }}>{example}</code>
                </pre>
            </FormWrap>
        </>
    )
}
