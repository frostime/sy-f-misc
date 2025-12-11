import { createMemo, For } from "solid-js";
import type { JSX } from "solid-js";

export default function SelectInput(props: {
    value?: string;
    changed?: (value: string) => void;
    style?: JSX.CSSProperties;
    options: Record<string, string>;
}) {
    const attrStyle = createMemo(() => ({
        style: props.style ?? {}
    }));

    return (
        <select
            class="b3-select fn__flex-center"
            {...attrStyle()}
            onChange={(e) => {
                props.changed?.(e.currentTarget.value);
            }}
        >
            <For each={Object.entries(props.options)}>
                {([optionValue, text]) => (
                    <option value={optionValue} selected={props.value === optionValue}>
                        {text}
                    </option>
                )}
            </For>
        </select>
    );
} 