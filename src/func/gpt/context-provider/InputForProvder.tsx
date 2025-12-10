import { TextArea } from "@/libs/components/Elements"
import { Rows } from "@/libs/components/Elements/Flex"
import TextInput from "@/libs/components/Elements/TextInput"
import { confirmDialog } from "@frostime/siyuan-plugin-kits"
import { ISignalRef, useSignalRef } from "@frostime/solid-signal-ref"
import { Switch, Match } from "solid-js"
import { render } from "solid-js/web"

const UserInput = (props: {
    text: ISignalRef<string>;
    description?: string;
    type: 'line' | 'area';
    placeholder?: string;
}) => {
    return (
        <Rows style={{ width: '100%', height: '100%' }}>
            <div class="b3-label__text" innerHTML={props.description}></div>
            <Switch>
                <Match when={props.type === 'area'}>
                    <TextArea
                        value={props.text()}
                        changed={(v) => { props.text.update(v) }}
                        spellcheck={false}
                    />
                </Match>
                <Match when={props.type === 'line'}>
                    <TextInput
                        value={props.text()}
                        onInput={(v) => { props.text.update(v) }}
                        spellcheck={false}
                        placeholder={props.placeholder}
                        style={{ width: '100%' }}
                    />
                </Match>
            </Switch>
        </Rows>
    )
}

export const inputDialogForProvider = (options: {
    type: 'line' | 'area';
    title: string;
    description: string;
    initialText?: string;
    confirm: (text: string) => void;
    cancel?: () => void;
    width?: string;
    height?: string;
}) => {
    const input = useSignalRef(options?.initialText ?? '');
    const container = document.createElement('div');
    container.style.display = 'contents';

    let disposer = () => { };
    if (options.type === 'area') {
        disposer = render(() => UserInput({
            text: input,
            description: options.description,
            type: options.type,
            placeholder: options.description,
        }), container);
    } else {
        disposer = render(() => UserInput({
            text: input,
            description: options.description,
            type: options.type,
        }), container);
    }

    confirmDialog({
        title: options.title,
        content: container,
        confirm: () => {
            options.confirm(input());
        },
        cancel: () => {
            options.cancel?.();
        },
        destroyCallback: () => {
            disposer();
        },
        width: options.width,
        height: options.height
    });
}
