/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-17 21:20:21
 * @FilePath     : /src/func/post-doc/select-target.tsx
 * @LastEditTime : 2024-08-10 21:24:38
 * @Description  : 
 */
import { FormInput as InputItem, FormWrap as SettingItemWrap } from '@/libs/components/Form';

import { Component, createSignal, Show } from "solid-js";
import { checkConnection, request } from "./core";
import { showMessage } from "siyuan";


const isValidHost = (host: string): boolean => {
    // Regular expression to match a valid domain or IP address
    const domainOrIpRegex = /^(?!-)[A-Za-z0-9-]+([-.]{1}[A-Za-z0-9]+)*.[A-Za-z]{2,}$|^(\d{1,3}\.){3}\d{1,3}$/;
    return domainOrIpRegex.test(host);
}


interface IProps {
    recursive?: boolean;
    history?: ITraget;
    confirm: (...v: any[]) => void;
    close: () => void;
}


const SelectTarget: Component<IProps> = (props) => {

    const { history } = props;

    const [workspace, setWorkspace] = createSignal<IWorkspace>({
        host: history?.host ?? '127.0.0.1',
        port: history?.port ?? 6806,
        token: history?.token ?? ''
    });

    const [dir, setDir] = createSignal({
        box: history?.box ?? '',
        dir: history?.dir ?? '/'
    });

    const [notebooks, setNotebooks] = createSignal({});

    const [validWorkspace, setValidWorkspace] = createSignal(false);

    const confirm = () => {
        if (!dir().dir.startsWith('/')) {
            showMessage("路径必须以 / 开头", 5000, 'error');
            return false;
        }
        props.close();
        props.confirm({ ...workspace(), ...dir() }, props.recursive);
    }

    const checkInputFormat = () => {
        //检查 workspace() 是否符合格式
        let { host, port } = workspace();
        if (port < 1000) return false;

        //check host
        if (host.startsWith('http://') || host.startsWith('https://')) {
            let url = new URL(host);
            host = url.hostname;
        }

        if (!isValidHost(host)) return false;
        setWorkspace((w: IWorkspace) => {
            return { ...w, host };
        });
        return true;
    }

    const checkRemote = async (showMsg?: boolean) => {
        showMsg = showMsg ?? true;
        if (!checkInputFormat()) {
            if (showMsg) showMessage("输入错误", 5000, 'error');
            return;
        }
        let { host, port, token } = workspace();
        let succeed = await checkConnection(host, port, token);
        if (!succeed) {
            if (showMsg) showMessage(`无法连接到 ${host}:${port}`, 5000, 'error');
            return;
        }
        if (succeed && showMsg) {
            showMessage("连接成功!", 3000);
        }
        let msg = await request(host, port, token, '/api/notebook/lsNotebooks');
        let boxes: Notebook[] = msg?.data?.notebooks;
        let options = {};
        boxes.forEach(box => {
            options[box.id] = box.name + (box.closed ? "*" : "");
        })
        console.log(options)
        setNotebooks(options);
        setDir(() => {
            return { ...dir(), box: Object.keys(options)[0] };
        });
        setValidWorkspace(succeed);
    }

    checkRemote(false);

    const SelectWorkspace = () => (
        <div style={{
            display: "flex",
            "flex-direction": "column",
            flex: 1
        }}>
            {/* recursive boolean */}
            <SettingItemWrap
                title="发布整个目录树?"
                description=""
            >
                <InputItem
                    key="recursive"
                    type="checkbox"
                    value={props.recursive}
                    changed={(recursive) => {
                        props.recursive = recursive;
                    }}
                />
            </SettingItemWrap>
            <div style={{ color: 'var(--b3-theme-primary);', "font-weight": 'bold' }}>
                <h2>设置远端 Workspace</h2>
            </div>
            <SettingItemWrap
                title="Host"
                description=""
            >
                <InputItem
                    key="host"
                    type="textinput"
                    value={workspace().host}
                    changed={(host) => {
                        setWorkspace((ws) => {
                            return { ...ws, host };
                        });
                        setValidWorkspace(false);
                    }}
                />
            </SettingItemWrap>
            <SettingItemWrap
                title="Port"
                description=""
            >
                <InputItem
                    key="port"
                    type="number"
                    value={workspace().port}
                    changed={(port) => {
                        setWorkspace((ws) => {
                            return { ...ws, port };
                        });
                        setValidWorkspace(false);
                    }}
                />
            </SettingItemWrap>
            <SettingItemWrap
                title="Token"
                description=""
            >
                <InputItem
                    key="token"
                    type="textinput"
                    value={workspace().token}
                    changed={(token) => {
                        setWorkspace((ws) => {
                            return { ...ws, token };
                        });
                        setValidWorkspace(false);
                    }}
                />
            </SettingItemWrap>
            <Show when={!validWorkspace()}>
                <div style={{ display: "flex", gap: '10px', padding: '0 24px' }}>
                    <div style='flex: 1;'></div>
                    <button class="b3-button" onClick={() => checkRemote(true)}>
                        验证服务连接
                    </button>
                </div>
            </Show>
        </div>
    );

    const SelectPath = () => (
        <div style={{
            display: "flex",
            "flex-direction": "column",
            flex: 1
        }}>
            <div style={{ color: 'var(--b3-theme-primary);', "font-weight": 'bold' }}>
                <h2>选择远端父目录</h2>
            </div>
            <SettingItemWrap
                title="笔记本"
                description=""
            >
                <InputItem
                    key="box"
                    type="select"
                    options={notebooks()}
                    value={dir().box}
                    changed={(box) => {
                        setDir((dir) => {
                            return { ...dir, box };
                        });
                    }}
                />
            </SettingItemWrap>
            <SettingItemWrap
                title="父文档路径"
                description=""
            >
                <InputItem
                    key="path"
                    type="textinput"
                    value={dir().dir}
                    changed={(path) => {
                        setDir((dir) => {
                            return { ...dir, path };
                        });
                    }}
                />
            </SettingItemWrap>
        </div>
    );

    return (
        <div style="flex: 1; display: flex; flex-direction: column; gap: 10px;">
            <div style={{
                height: '100%',
                flex: 1,
                padding: '16px 24px',
                'overflow-y': 'auto'
            }}>
                <div class="ft__breakword fn__flex fn__flex-1" style="height: 100%; flex-direction: column; ">
                    <SelectWorkspace />
                    <Show when={validWorkspace()}>
                        <SelectPath />
                    </Show>
                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel" onClick={props.close}>
                    {window.siyuan.languages.cancel}
                </button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--text" onClick={confirm}>
                    {window.siyuan.languages.confirm}
                </button>
            </div>
        </div>
    );
};

export default SelectTarget;
