import InputItem from "@/libs/components/item-input";
import SettingItemWrap from "@/libs/components/item-wrap";
import { Component, createSignal, Show } from "solid-js";
import { checkConnection, request } from "./core";
import { showMessage } from "siyuan";


const isValidIP = (ip: string): boolean => {
    const ipSegments = ip.split('.');
    if (ipSegments.length !== 4) return false;
    for (let segment of ipSegments) {
        if (!/^\d+$/.test(segment)) return false;
        const num = parseInt(segment, 10);
        if (num < 0 || num > 255) return false;
    }
    return true;
}


interface IProps {
    history?: ITraget;
    confirm: (v: any) => void;
    close: () => void;
}


const SelectTarget: Component<IProps> = (props) => {

    const { history } = props;

    const [workspace, setWorkspace] = createSignal<IWorkspace>({
        ip: history?.ip ?? '127.0.0.1',
        port: history?.port ?? 6806,
        token: history?.token ?? ''
    });

    const [dir, setDir] = createSignal({
        box: history?.box ?? '',
        path: history?.path ?? '/'
    });

    const [notebooks, setNotebooks] = createSignal({});

    const [validWorkspace, setValidWorkspace] = createSignal(false);

    const confirm = () => {
        props.close();
        props.confirm({ ...workspace(), ...dir() });
    }

    const checkInput = () => {
        //检查 workspace() 是否符合格式
        const { ip, port } = workspace();
        if (port < 1000) return false;
        // if (token === '') return false;
        //check ip
        if (!isValidIP(ip)) return false;
        return true;
    }

    const checkRemote = async () => {
        if (!checkInput()) {
            showMessage("输入错误", 5000, 'error');
            return;
        }
        let { ip, port, token } = workspace();
        let succeed = await checkConnection(ip, port, token);
        if (succeed) {
            showMessage("连接成功!", 3000);
        }
        let msg = await request(ip, port, token, '/api/notebook/lsNotebooks');
        let boxes: Notebook[] = msg?.data?.notebooks;
        let options = {};
        boxes.forEach(box => {
            options[box.id] = box.name + (box.closed ? "*" : "");
        })
        console.log(options)
        setNotebooks(options);
        setValidWorkspace(succeed);
    }

    const SelectWorkspace = () => (
        <div style={{
            display: "flex",
            "flex-direction": "column",
            flex: 1
        }}>
            <div style={{ color: 'var(--b3-theme-primary);', "font-weight": 'bold' }}>
                <h2>设置远端 Workspace</h2>
            </div>
            <SettingItemWrap
                title="IP"
                description=""
            >
                <InputItem
                    key="ip"
                    type="textinput"
                    value={workspace().ip}
                    changed={(ip) => {
                        setWorkspace((ws) => {
                            return { ...ws, ip: ip };
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
                    <button class="b3-button" onClick={checkRemote}>
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
                    value={dir().path}
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
