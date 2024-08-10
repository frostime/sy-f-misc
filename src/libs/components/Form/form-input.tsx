import { createMemo, For } from "solid-js";

interface IProps extends ISettingItemCore {
    changed?: (v?: any) => void;
    style?: { [key: string]: string | number };
}

export default function FormInput(props: IProps) {

    const fn_size = true;

    function click() {
        props.button?.callback();
    }

    function changed(val: any) {
        props?.changed(val);
    }

    const attrStyle = createMemo(() => {
        let styles = {};
        if (props.type === 'textarea') {
            styles = { resize: "vertical", height: '10rem', "white-space": "nowrap" };
        }
        let propstyle = props.style ?? {};
        styles = {...styles, ...propstyle};
        return {
            style: styles
        };
    })

    function renderInput() {
        if (props.type === "checkbox") {
            return (
                <input
                    class="b3-switch fn__flex-center"
                    id={props.key}
                    {...attrStyle()}
                    type="checkbox"
                    checked={props.value}
                    onInput={(e) => {
                        changed(e.currentTarget.checked);
                    }}
                />
            );
        } else if (props.type === "textinput") {
            return (
                <input
                    class="b3-text-field fn__flex-center"
                    classList={{ fn__size200: fn_size }}
                    id={props.key}
                    {...attrStyle()}
                    placeholder={props.placeholder}
                    value={props.value}
                    onInput={(e) => {
                        changed(e.currentTarget.value);
                    }}
                />
            );
        } else if (props.type === "textarea") {
            return (
                <textarea
                    class="b3-text-field fn__block"
                    // style="resize: vertical; height: 10em; white-space: nowrap;"
                    {...attrStyle()}
                    value={props.value}
                    onInput={(e) => {
                        changed(e.currentTarget.value);
                    }}
                />
            );
        } else if (props.type === "number") {
            return (
                <input
                    class="b3-text-field fn__flex-center"
                    classList={{ fn__size200: fn_size }}
                    id={props.key}
                    {...attrStyle()}
                    type="number"
                    value={props.value}
                    onInput={(e) => {
                        changed(e.currentTarget.value);
                    }}
                />
            );
        } else if (props.type === "button") {
            return (
                <button
                    class="b3-button b3-button--outline fn__flex-center"
                    classList={{ fn__size200: fn_size }}
                    id={props.key}
                    {...attrStyle()}
                    onClick={click}
                >
                    {props.button?.label ?? props.value}
                </button>
            );
        } else if (props.type === "select") {
            return (
                <select
                    class="b3-select fn__flex-center"
                    classList={{ fn__size200: fn_size }}
                    {...attrStyle()}
                    id={props.key}
                    onChange={(e) => {
                        changed(e.currentTarget.value);
                    }}
                >
                    <For each={Object.entries(props.options)}>
                        {([optionValue, text]) => (
                            <option value={optionValue} selected={props.value === optionValue}>{text}</option>
                        )}
                    </For>
                </select>
            );
        } else if (props.type === "slider") {
            return (
                <div class="b3-tooltips b3-tooltips__n" aria-label={props.value}>
                    <input
                        class="b3-slider"
                        classList={{ fn__size200: fn_size }}
                        {...attrStyle()}
                        id={props.key}
                        min={props.slider.min}
                        max={props.slider.max}
                        step={props.slider.step}
                        type="range"
                        value={props.value}
                        onInput={(e) => {
                            changed(e.currentTarget.value);
                        }}
                    />
                </div>
            );
        }
    }

    return (
        <>
            {renderInput()}
        </>
    );
}
