import { createMemo } from "solid-js";
import type { JSX } from "solid-js";

interface IButtonInputProps {
    label?: string;
    style?: JSX.CSSProperties;
    onClick?: () => void;
    classOutlined?: boolean;
    classText?: boolean;
}

export default function ButtonInput(props: IButtonInputProps) {
    const attrStyle = createMemo(() => ({
        style: props.style ?? {}
    }));

    return (
        <button
            class="b3-button"
            classList={{
                'b3-button--outline': props.classOutlined,
                'b3-button--text': props.classText,
            }}
            {...attrStyle()}
            onClick={() => props.onClick?.()}
        >
            {props.label}
        </button>
    );
} 