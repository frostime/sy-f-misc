/**
 * 方便把外部生成的 HTMLElement 或 JSX.Element 包装成 Solid 组件使用
 *
 * 适合轻量级微型组件, 避免写 tsx
 */
import { html2ele } from "@frostime/siyuan-plugin-kits";
import { Component, JSX, onCleanup, onMount } from "solid-js";
import { render, renderToString } from "solid-js/web";


export const Div = (props: JSX.IntrinsicElements['div']) => {

    return <div
        {...props}
    >
        {props.children}
    </div>
}

export const Empty = (props: {
    children: JSX.Element
}) => {
    <>
        {props.children}
    </>
}


// ================================================================
// Wrapper
// ================================================================

/**
 * 外部元素包装组件
 * 支持 JSX.Element、HTMLElement 或 ExternalElementWithDispose
 */
export const SolidContainerWrapper: Component<{
    element: () => FlexibleElement
}> = (props) => {
    const result = props.element();

    // JSX 元素直接返回
    if (!(result instanceof HTMLElement) &&
        !(typeof result === 'object' && result !== null && 'element' in result)) {
        return result as JSX.Element;
    }

    // 处理 HTMLElement
    let containerRef: HTMLDivElement;

    onMount(() => {
        const element = result instanceof HTMLElement ? result : result.element;
        const dispose = result instanceof HTMLElement ? undefined : result.dispose;

        containerRef.appendChild(element);

        onCleanup(() => {
            dispose?.();
            element.remove();
        });
    });

    return <div ref={containerRef} style={{ display: 'contents' }} />;
};


export const ele2solid = (options: {
    // element: HTMLElement, disposer?: () => void
    element: HTMLElement, disposer?: () => void
}): JSX.Element => {
    return <SolidContainerWrapper element={() => {
        return {
            element: options.element,
            dispose: options.disposer,
        };
    }} />;
}

/**
 * 将 HTML 字符串转换为 Solid 组件
 * @param options
 * @param options.html HTML 字符串
 * @param options.setup 可选的设置函数，接收生成的 HTMLElement 作为参数，可返回一个清理函数
 * @returns
 */
export const html2solid = (options: {
    html: string,
    setup?: (element: HTMLElement) => (() => void) | void,
}): JSX.Element => {
    return <SolidContainerWrapper element={() => {
        const ele = html2ele(options.html);
        const dispose = options.setup?.(ele);
        return {
            element: ele,
            dispose: dispose,
        };
    }} />;
}


// ================================================================
// Solid Component --> HTMLElement
// ================================================================
/**
 * 将 Solid 组件转换为 HTML 字符串（静态快照）
 * 注意：返回的是字符串，会丢失所有事件绑定和响应式连接
 */
export const solid2html = (component: () => JSX.Element): string => {
    const container = document.createElement("div");
    // 使用 createRoot 的简化版 render
    const dispose = render(component, container);
    const html = container.innerHTML;
    dispose();
    return html;
};

/**
 * 本质就是直接调用 renderToString, 更加轻量, 不触发 onMount 等生命周期
 * 不过对复杂组件处理可能会出现问题
 * @param component
 * @returns
 */
export const solid2string = (component: () => JSX.Element): string => {
    return renderToString(component);
};

/**
 * 将 Solid 组件转换为真实的 HTMLElement
 * @param component 组件函数
 * @returns 返回包含组件内容的 div 容器
 */
export const solid2element = (component: () => JSX.Element): { element: HTMLElement, dispose: () => void } => {
    const container = document.createElement("div");
    container.style.display = "contents"; // 使容器在布局上透明
    const dispose = render(component, container);

    // return Object.assign(container, { dispose });
    return { element: container, dispose };
};

