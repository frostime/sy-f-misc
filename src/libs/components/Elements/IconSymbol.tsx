import { JSX } from "solid-js/jsx-runtime";

export default function SvgSymbol(props: {
    children: string, size?: string,
    onClick?: (e: MouseEvent) => void,
    style?: JSX.CSSProperties,
    className?: string
}) {
    return (
        <svg style={{
            height: props.size || '100%',
            width: props.size || '100%',
            margin: '0 auto',
            fill: 'currentColor',
            ...props.style
        }} onclick={props.onClick} class={props.className}>
            <use href={`#${props.children}`} />
        </svg>
    );
}
