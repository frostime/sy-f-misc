export default function SvgSymbol(props: {
    children: string, size?: string,
    onClick?: (e: MouseEvent) => void
}) {
    return (
        <svg style={{
            height: props.size || '100%',
            width: props.size || '100%',
            margin: '0 auto',
            fill: 'currentColor'
        }} onclick={props.onClick}>
            <use href={`#${props.children}`} />
        </svg>
    );
}
