import { createMemo } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import ButtonInput from "./ButtonInput";
import { useSignalRef } from "@frostime/solid-signal-ref";


const Enter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
        e.stopImmediatePropagation();
    }
}

export default function TextArea(props: {
    value?: string | Accessor<string>;
    onInput?: (value: string) => void;
    onChanged?: (value: string) => void;
    style?: JSX.CSSProperties;
    spellcheck?: boolean;
}) {
    const attrStyle = createMemo(() => {
        const baseStyle: JSX.CSSProperties = {
            resize: "vertical",
            height: '10rem',
            "white-space": "pre-wrap"
        };
        return {
            style: { ...baseStyle, ...(props.style ?? {}) }
        };
    });

    return (
        <textarea
            class="b3-text-field fn__block"
            {...attrStyle()}
            value={typeof props.value === 'function' ? props.value() : (props.value || '')}
            spellcheck={props.spellcheck}
            onChange={(e) => {
                props.onChanged?.(e.currentTarget.value);
            }}
            onInput={(e) => {
                props.onInput?.(e.currentTarget.value);
            }}
            onkeydown={Enter}
        />
    );
}

export const TextAreaWithActionButton = (props: {
    value?: string;
    onChanged?: (value: string) => void;
    containerStyle?: JSX.CSSProperties
    textareaStyle?: JSX.CSSProperties;
    spellcheck?: boolean;
    action?: (text: string) => void;
    actionText?: string;
}) => {
    const currentText = useSignalRef(props.value || '');
    const changed = (value: string) => {
        props.onChanged?.(value);
        currentText(value);
    }
    const style = {
        width: '100%', height: '100px', 'font-family': 'var(--b3-font-family-code)',
        ...props.textareaStyle
    }
    return (
        <div style={props.containerStyle}>
            <TextArea
                value={props.value}
                onChanged={changed}
                style={style}
                spellcheck={props.spellcheck}
            />
            <ButtonInput
                onClick={async () => {
                    props.action?.(currentText());
                }}
                style={{
                    position: "absolute",
                    bottom: "1rem",
                    right: "1rem",
                }}
            >
                {props.actionText}
            </ButtonInput>
        </div>
    );
};
