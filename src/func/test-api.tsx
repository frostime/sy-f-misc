import type FMiscPlugin from "@/index";
import TextInput from "@/libs/components/text-input";
import { createSignal } from "solid-js";

import { solidDialog } from "@/libs/dialog";

import { request } from "@/api";
import { Menu } from "siyuan";

const Panel = () => {
    const [endpoint, setEndpoint] = createSignal("");
    const [payload, setPayload] = createSignal("");
    const [result, setResult] = createSignal("");

    const parsePayload = () => {
        let obj = {};
        payload().split('\n').forEach(line => {
            line = line.trim();
            if (!line) return;
            let parts = line.split(':');
            if (parts.length < 2) return;
            obj[parts[0].trim()] = parts[1].trim();
        });
        return obj;
    }

    const updateResult = (v: string) => {
        v = JSON.stringify(v, null, 4);
        setResult(v);
    }

    const send = () => {
        request(endpoint(), parsePayload()).then(v => {
            updateResult(v);
        }).catch(err => {
            setResult(`Error!\n\n${err}`)
        });
    }

    return (
        <div style={{
            display: "flex",
            "flex-direction": "column",
            flex: 1,
            padding: '10px',
            gap: '10px',
        }}>
            <div class="fn__flex" style="gap: 10px;">
                <TextInput
                    text={endpoint()}
                    update={setEndpoint}
                    styles={{'flex': 1}}
                    fontSize="16px"
                />
                <button class="b3-button" onClick={send}>Send</button>
            </div>
            <div class="fn__flex fn__flex-1" style={{gap: '10px'}}>
                <TextInput text={payload()}
                    update={setPayload} type="area"
                    fontSize="18px"
                />
                <TextInput text={result()}
                    update={setResult} type="area"
                    fontSize="18px"
                />
            </div>
        </div>
    )
}

const showMenu = (menu: Menu) => {
    menu.addItem({
        icon: 'iconBug',
        label: '测试 API',
        click: () => {
            solidDialog({
                title: '测试 API',
                loader: Panel,
                width: '900px',
                height: '500px'
            });
        }
    })
}

export let name = "TestAPI";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.eb.on('on-topbar-menu', showMenu);

}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.eb.off('on-topbar-menu', showMenu);
}
