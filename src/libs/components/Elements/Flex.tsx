import { JSX, Component, children } from 'solid-js';

// Rows 组件，水平排列子元素
export const Rows: Component<{
    children: JSX.Element,
    gap?: string,
    align?: JSX.CSSProperties['align-items'],
    justify?: JSX.CSSProperties['justify-content'],
    style?: JSX.CSSProperties
}> = (props) => {
    const C = children(() => props.children);
    return (
        <div
            style={{
                display: 'flex',
                'flex-direction': 'column',
                gap: props.gap ?? '5px',
                'align-items': props.align ?? 'flex-start',
                'justify-content': props.justify ?? 'center',
                ...props.style
            }}
        >
            {C()}
        </div>
    );
};

// Cols 组件，垂直排列子元素
export const Cols: Component<{
    children: JSX.Element,
    gap?: string,
    align?: JSX.CSSProperties['align-items'],
    justify?: JSX.CSSProperties['justify-content'],
    style?: JSX.CSSProperties
}> = (props) => {
    const C = children(() => props.children);
    return (
        <div
            style={{
                display: 'flex',
                'flex-direction': 'row',
                gap: props.gap ?? '5px',
                'align-items': props.align ?? 'center',
                'justify-content': props.justify ?? 'center',
                ...props.style
            }}
        >
            {C()}
        </div>
    );
};

// LeftRight 组件，将 left 和 right 分别放置在左右两侧
export const LeftRight: Component<{
    left: JSX.Element,
    right: JSX.Element,
    gap?: string,
    align?: 'center' | 'flex-start' | 'flex-end'
    containerStyle?: JSX.CSSProperties
    leftStyle?: JSX.CSSProperties
    rightStyle?: JSX.CSSProperties
}> = (props) => {
    return (
        <div
            style={{
                display: 'flex',
                'justify-content': 'space-between',
                gap: props.gap ?? '5px',
                'align-items': props.align ?? 'center',
                ...props.containerStyle
            }}
        >
            <div style={props.leftStyle}>{props.left}</div>
            <div style={props.rightStyle}>{props.right}</div>
        </div>
    );
};