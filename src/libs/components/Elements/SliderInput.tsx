// import { createSignalRef } from "@frostime/solid-signal-ref";
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";

export default function SliderInput(props: {
    value?: number;
    changed?: (value: number) => void;
    style?: JSX.CSSProperties;
    min?: number;
    max?: number;
    step?: number;
    tooltip?: boolean;
}) {
    let value = () => props.value ?? 0;

    const attrStyle = createMemo(() => ({
        style: props.style ?? {}
    }));

    const classTooltip = () => {
        return props.tooltip ? 'b3-tooltips b3-tooltips__n' : '';
    }

    return (
        <div class={classTooltip()} aria-label={String(value())}>
            <input
                class="b3-slider"
                {...attrStyle()}
                min={props.min ?? 0}
                max={props.max ?? 100}
                step={props.step ?? 1}
                type="range"
                value={value()}
                onInput={(e) => {
                    e.stopImmediatePropagation();
                    props.changed?.(Number(e.currentTarget.value));
                }}
                onClick={(e) => {
                    e.stopImmediatePropagation();
                }}
            />
        </div>
    );
} 