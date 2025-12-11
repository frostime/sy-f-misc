import { For } from "solid-js";
import type { JSX } from "solid-js";

export default function RadioInput(props: {
    value?: string;
    changed?: (value: string) => void;
    style?: JSX.CSSProperties;
    options: Record<string, string>;
    name?: string;
}) {
    const radioName = props.name || `radio-${Math.random().toString(36).substr(2, 9)}`;

    return (
        <div style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '8px',
            ...props.style
        }}>
            <For each={Object.entries(props.options)}>
                {([optionValue, text]) => (
                    <label style={{
                        display: 'flex',
                        'align-items': 'center',
                        gap: '6px',
                        cursor: 'pointer'
                    }}>
                        <input
                            type="radio"
                            name={radioName}
                            value={optionValue}
                            checked={props.value === optionValue}
                            onChange={(e) => {
                                if (e.currentTarget.checked) {
                                    props.changed?.(optionValue);
                                }
                            }}
                            style={{ cursor: 'pointer' }}
                        />
                        <span>{text}</span>
                    </label>
                )}
            </For>
        </div>
    );
}

