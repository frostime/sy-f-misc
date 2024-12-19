import type FMiscPlugin from "@/index";
import TextInput from "@/libs/components/text-input";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import { request } from "@/api";
import { Menu, openTab } from "siyuan";

let plugin: FMiscPlugin;

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
            let name = parts.splice(0, 1);
            obj[name[0].trim()] = parts.join(':').trim();
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
            margin: '25px',
            gap: '15px',
        }}>
            <div class="fn__flex" style="gap: 30px;">
                <TextInput
                    text={endpoint()}
                    update={setEndpoint}
                    styles={{'flex': 1, 'line-height': '22px'}}
                    fontSize="18px"
                />
                <button class="b3-button" onClick={send}>Send</button>
            </div>
            <div class="fn__flex fn__flex-1" style={{gap: '20px'}}>
                <TextInput text={payload()}
                    update={setPayload} type="area"
                    fontSize="20px"
                    styles={{
                        'line-height': '24px'
                    }}
                />
                <TextInput text={result()}
                    update={setResult} type="area"
                    fontSize="20px"
                    styles={{
                        'line-height': '24px'
                    }}
                />
            </div>
        </div>
    )
}

function openPanel() {
    //random string
    const id = Math.random().toString(36).substring(7);
    let disposer: () => void;
    plugin.addTab({
        'type': id,
        init() {
            (this.element as HTMLElement).style.display = 'flex';
            disposer = render(Panel, this.element);
        },
        destroy() {
            disposer();
        }
    });
    openTab({
        app: plugin.app,
        custom: {
            title: 'TestAPI',
            icon: 'iconBug',
            id: 'sy-f-misc' + id,
        }
    });
}

const showMenu = (menu: Menu) => {
    menu.addItem({
        icon: 'iconBug',
        label: '测试 API',
        click: openPanel
    })
}

export let name = "TestAPI";
export let enabled = false;

export const declareToggleEnabled = {
    title: '🐞 TestAPI',
    description: '测试 API 功能',
    defaultEnabled: false
};

export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin_.eb.on('on-topbar-menu', showMenu);
    plugin = plugin_;
}

export const unload = (plugin_: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin_.eb.off('on-topbar-menu', showMenu);
    plugin = null;
}
