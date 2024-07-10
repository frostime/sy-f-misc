// import { createSignal } from "solid-js";
// import { render } from "solid-js/web";

const Enter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
        e.stopImmediatePropagation();
    }
}

interface IProps {
    text: string;
    update: (v: string) => void;
    type?: 'line' | 'area';
    fontSize?: string;
    styles?: {[key: string]: string | number | boolean}
}

const TextInput = (props: IProps) => {
    if (props.type === 'area') {
        return <textarea class="b3-text-field fn__block" onkeydown={Enter}
            style={{
                resize: 'none',
                "font-size": props.fontSize,
                ...props?.styles ?? {}
            }}
            spellcheck={false}
            onInput={(e) => {
                props.update(e.currentTarget.value);
            }}>
            {props.text ?? ''}
        </textarea>
    } else {
        return <input
            class="b3-text-field fn__flex-center"
            style={{
                resize: 'none',
                "font-size": props.fontSize,
                ...props?.styles ?? {}
            }}
            spellcheck={false}
            value={props.text}
            onKeyDown={Enter}
            onInput={(e) => {
                props.update(e.currentTarget.value);
            }}
        />
    }
}

export default TextInput;
