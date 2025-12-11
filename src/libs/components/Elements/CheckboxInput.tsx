import { createMemo, JSX } from "solid-js";


export default function CheckboxInput(props: {
    checked?: boolean;
    changed?: (value: boolean) => void;
    style?: JSX.CSSProperties;
}) {
    const attrStyle = createMemo(() => ({
        style: props.style ?? {}
    }));

    return (
        <input
            class="b3-switch fn__flex-center"
            {...attrStyle()}
            type="checkbox"
            checked={props.checked}
            onInput={(e) => {
                props.changed?.(e.currentTarget.checked);
            }}
        />
    );
} 