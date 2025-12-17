/**
 * 节省组件开销, 避免 solidjs 组件太多
 * 这样可以很方便把外部生成的 HTMLElement 或 JSX.Element 包装成 Solid 组件使用
 * 
 * 适合轻量级微型组件, 避免写 tsx
 */
import { html2ele } from "@frostime/siyuan-plugin-kits";
import { Component, JSX, onCleanup, onMount } from "solid-js";

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