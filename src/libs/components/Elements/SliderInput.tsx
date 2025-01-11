import { createSignalRef } from "@frostime/solid-signal-ref";
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";

interface ISliderInputProps {
    value?: number;
    changed?: (value: number) => void;
    style?: JSX.CSSProperties;
    min?: number;
    max?: number;
    step?: number;
}

export default function SliderInput(props: ISliderInputProps) {
    let value = createSignalRef(props.value ?? 0);

    const attrStyle = createMemo(() => ({
        style: props.style ?? {}
    }));

    return (
        <div class="b3-tooltips b3-tooltips__n" aria-label={String(value())}>
            <input
                class="b3-slider"
                {...attrStyle()}
                min={props.min ?? 0}
                max={props.max ?? 100}
                step={props.step ?? 1}
                type="range"
                value={props.value}
                onInput={(e) => {
                    props.changed?.(Number(e.currentTarget.value));
                    value.update(Number(e.currentTarget.value));
                }}
            />
        </div>
    );
} 