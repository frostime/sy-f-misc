import { JSX } from "solid-js/jsx-runtime";

export const SvgSymbol = (props: {
    children: string, size?: string,
    onclick?: (e: MouseEvent) => void,
    style?: JSX.CSSProperties
}) => (
    <svg style={{
        height: props.size || '100%',
        width: props.size || '100%',
        margin: '0 auto',
        fill: 'currentColor',
        ...(props.style ?? {})
    }} onclick={props.onclick}>
        <use href={`#${props.children}`} />
    </svg>
);
