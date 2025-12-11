import { JSX } from "solid-js/jsx-runtime";

export const LabelText = (props: {
    text?: string;
    children?: JSX.Element | JSX.Element[];
    preset: 'bare' | 'outlined' | 'filled';
    fontSize?: string;
    style?: JSX.CSSProperties;
}) => {
    const children = (
        <>
            {props.text}
            {props.children}
        </>
    );
    let style: JSX.CSSProperties = {
        padding: "4px 8px",
        display: "inline-flex",
        'align-items': "center",
        'justify-content': "center",
        'box-sizing': "border-box",
        'text-align': "center",
        border: "0",
        'font-size': props.fontSize || 'inherit',
        color: 'var(--b3-theme-on-surface)'
    };
    if (props.preset === 'bare') {
    } else if (props.preset === 'outlined') {
        style = {
            ...style,
            color: "var(--b3-theme-primary)",
            'border-radius': "var(--b3-border-radius)",
            'background-color': "rgba(0,0,0,0)",
        }
    } else if (props.preset === 'filled') {
        style = {
            ...style,
            color: "var(--b3-theme-on-primary)",
            'border-radius': "var(--b3-border-radius)",
            'background-color': "var(--b3-theme-primary)",
        }
    }

    if (props.style) {
        style = {
            ...style,
            ...props.style
        }
    }

    return (
        <span style={style}>
            {children}
        </span>
    )
}