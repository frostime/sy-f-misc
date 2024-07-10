import { Dialog } from "siyuan";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import TextInput from "./components/text-input";


interface IProps {
    type: 'line' | 'area';
    text?: string;
    confirm: (v: string) => void;
    close: () => void;
}

const InputDialog = (props: IProps) => {
    const [text, setText] = createSignal(props.text);

    return (
        <>
            <div class="fn__flex" style={{
                height: '100%',
                flex: 1,
                padding: '16px 24px',
                'overflow-y': 'auto'
            }}>
                <div class="ft__breakword fn__flex fn__flex-1" style="height: 100%;">
                    <TextInput text={text()} update={setText} />
                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel" onClick={props.close}>
                    {window.siyuan.languages.cancel}
                </button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--text" onClick={() => {
                    props.confirm(text());
                    props.close();
                }}>
                    {window.siyuan.languages.confirm}
                </button>
            </div>
        </>
    );
}

const inputDialog = (args: {
    title: string, text?: string, confirm?: (text: string) => void,
    type?: 'line' | 'area', width?: string, height?: string
}) => {
    const dialog = new Dialog({
        title: args.title,
        content: `<div class="contents" style="display: contents;"/>`,
        width: args.width,
        height: args.height
    });
    const close = () => dialog.destroy();
    let ele = dialog.element.querySelector(".contents");
    render(() => InputDialog({
        type: args.type,
        text: args.text,
        confirm: (val) => {
            args.confirm(val);
        },
        close: close
    }), ele);
}

export default inputDialog;
