export const SvgSymbol = (props: {
    children: string, size?: string,
    onclick?: (e: MouseEvent) => void
}) => (
    <svg style={{
        height: props.size || '100%',
        width: props.size || '100%',
        margin: '0 auto',
        fill: 'currentColor'
    }} onclick={props.onclick}>
        <use href={`#${props.children}`} />
    </svg>
);
