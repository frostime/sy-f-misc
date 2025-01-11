import { createMemo } from "solid-js";
import type { JSX } from "solid-js";

interface ITextAreaProps {
    value?: string;
    changed?: (value: string) => void;
    style?: JSX.CSSProperties;
    spellcheck?: boolean;
}

export default function TextArea(props: ITextAreaProps) {
    const attrStyle = createMemo(() => {
        const baseStyle: JSX.CSSProperties = {
            resize: "vertical",
            height: '10rem',
            "white-space": "nowrap"
        };
        return {
            style: { ...baseStyle, ...(props.style ?? {}) }
        };
    });

    return (
        <textarea
            class="b3-text-field fn__block"
            {...attrStyle()}
            value={props.value}
            spellcheck={props.spellcheck}
            onInput={(e) => {
                props.changed?.(e.currentTarget.value);
            }}
        />
    );
} 