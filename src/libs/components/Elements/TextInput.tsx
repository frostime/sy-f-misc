import { createMemo } from "solid-js";
import type { JSX } from "solid-js";

interface ITextInputProps {
    value?: string;
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

    return (
        <input
            class="b3-text-field fn__flex-center"
            {...attrStyle()}
            placeholder={props.placeholder}
            value={props.value}
            onInput={(e) => {
                props.changed?.(e.currentTarget.value);
            }}
            spellcheck={props.spellcheck}
            type={props.password ? "password" : "text"}
        />
    );
} 