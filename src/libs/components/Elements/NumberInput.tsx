import { createMemo } from "solid-js";
import type { JSX } from "solid-js";

interface INumberInputProps {
    value?: number;
    changed?: (value: number) => void;
    style?: JSX.CSSProperties;
    min?: number;
    max?: number;
    step?: number;
}

export default function NumberInput(props: INumberInputProps) {
    const attrStyle = createMemo(() => ({
        style: props.style ?? {}
    }));

    return (
        <input
            class="b3-text-field fn__flex-center"
            {...attrStyle()}
            type="number"
            value={props.value}
            onInput={(e) => {
                props.changed?.(Number(e.currentTarget.value));
            }}
            min={props.min}
            max={props.max}
            step={props.step}
        />
    );
} 