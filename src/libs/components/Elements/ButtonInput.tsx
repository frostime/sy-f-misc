import { createMemo } from "solid-js";
import type { JSX } from "solid-js";


export default function ButtonInput(props: {
    label?: string;
    style?: JSX.CSSProperties;
    onClick?: () => void;
    classOutlined?: boolean;
    classText?: boolean;
    children?: JSX.Element
}) {
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
            {props.children}
        </button>
    );
}
