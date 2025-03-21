import { createMemo } from "solid-js";
import type { Accessor, JSX } from "solid-js";

interface ITextInputProps {
    value?: string | Accessor<string>;
    changed?: (value: string) => void;
    style?: JSX.CSSProperties;
    placeholder?: string;
    password?: boolean;
    spellcheck?: boolean;
}

export default function TextInput(props: ITextInputProps) {
    const attrStyle = createMemo(() => ({
        style: props.style ?? {}
    }));

    const value = () => {
        if (typeof props.value === 'string') {
            return props.value;
        } else if (typeof props.value === 'function') {
            return props.value();
        }
        return '';
    }

    return (
        <input
            class="b3-text-field fn__flex-center"
            {...attrStyle()}
            placeholder={props.placeholder}
            value={value()}
            onInput={(e) => {
                props.changed?.(e.currentTarget.value);
            }}
            spellcheck={props.spellcheck}
            type={props.password ? "password" : "text"}
        />
    );
} 