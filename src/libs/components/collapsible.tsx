import { JSX, ParentComponent, createSignal, Show } from "solid-js";
import SvgSymbol from "./Elements/IconSymbol";

/**
 * 通用可折叠容器组件
 * 
 * 提供标题栏 + 可折叠内容区域的布局
 */

export interface CollapsibleContainerProps {
    /** 标题文本 */
    title: string;
    /** 初始是否展开，默认 true */
    defaultExpanded?: boolean;
    /** 受控模式：外部控制展开状态 */
    expanded?: boolean;
    /** 展开状态变化回调 */
    onExpandedChange?: (expanded: boolean) => void;
    /** 标题栏右侧的操作按钮区域 */
    actions?: JSX.Element;
    /** 标题栏额外的类名 */
    headerClass?: string;
    /** 内容区域额外的类名 */
    contentClass?: string;
    /** 容器额外的类名 */
    containerClass?: string;
    /** 是否显示折叠图标，默认 true */
    showCollapseIcon?: boolean;
    /** 标题栏样式 */
    headerStyle?: JSX.CSSProperties;
    /** 内容区域样式 */
    contentStyle?: JSX.CSSProperties;
    /** 容器样式 */
    containerStyle?: JSX.CSSProperties;
}

export const CollapsibleContainer: ParentComponent<CollapsibleContainerProps> = (props) => {
    // 内部状态（非受控模式）
    const [internalExpanded, setInternalExpanded] = createSignal(props.defaultExpanded ?? true);

    // 判断是否为受控模式
    const isControlled = () => props.expanded !== undefined;

    // 获取当前展开状态
    const expanded = () => isControlled() ? props.expanded! : internalExpanded();

    // 切换展开状态
    const toggle = () => {
        const newValue = !expanded();
        if (!isControlled()) {
            setInternalExpanded(newValue);
        }
        props.onExpandedChange?.(newValue);
    };

    const showCollapseIcon = () => props.showCollapseIcon ?? true;

    const defaultHeaderStyle: JSX.CSSProperties = {
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
        'user-select': 'none',
        // 'border-radius': '4px',
        'border-top-left-radius': '4px',
        'border-top-right-radius': '4px',
        'background-color': 'var(--b3-theme-surface)',
        'border': '1px solid var(--b3-border-color)',
    };

    const defaultContentStyle: JSX.CSSProperties = {
        padding: '4px 0',
    };

    const defaultContainerStyle = {
        padding: '0px',
        'border': '1px solid var(--b3-border-color)'
    }

    return (
        <div class={props.containerClass} style={{ ...defaultContainerStyle, ...props.containerStyle }}>
            {/* 标题栏 */}
            <div
                class={props.headerClass}
                style={{ ...defaultHeaderStyle, ...props.headerStyle }}
                onClick={toggle}
            >
                {/* 折叠图标 */}
                <Show when={showCollapseIcon()}>
                    <span style={{
                        transition: 'transform 0.2s',
                        transform: expanded() ? 'rotate(90deg)' : 'rotate(0deg)',
                        display: 'flex',
                        'align-items': 'center'
                    }}>
                        <SvgSymbol size="16px">iconRight</SvgSymbol>
                    </span>
                </Show>

                {/* 标题 */}
                <span style={{ flex: 1, 'font-weight': 'bold' }}>
                    {props.title}
                </span>

                {/* 操作按钮区域 */}
                <Show when={props.actions}>
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: 'flex', gap: '4px', 'align-items': 'center' }}
                    >
                        {props.actions}
                    </div>
                </Show>
            </div>

            {/* 内容区域 */}
            <Show when={expanded()}>
                <div
                    class={props.contentClass}
                    style={{ ...defaultContentStyle, ...props.contentStyle }}
                >
                    {props.children}
                </div>
            </Show>
        </div>
    );
};

export default CollapsibleContainer;
