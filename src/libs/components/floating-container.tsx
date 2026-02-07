/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-16
 * @FilePath     : /src/libs/components/floating-container.tsx
 * @Description  : 全局浮动容器组件
 */

import { type Component, createSignal, onCleanup, onMount, JSXElement } from 'solid-js';
import { render } from 'solid-js/web';
import { IconSymbol } from './Elements';
import { debounce } from '@frostime/siyuan-plugin-kits';

/**
 * 浮动容器组件
 */
export const FloatingContainer: Component<{
    children: JSXElement;
    onClose?: () => void;
    initialPosition?: { x: number; y: number };
    style?: Record<string, string>;
    title?: string;
    id?: string;
    allowResize?: boolean;
    onAfterMounted?: (options: {
        container: HTMLDivElement;
        containerHeader: HTMLDivElement;
        containerBody: HTMLDivElement;
    }) => void;
}> = (props) => {
    // 设置默认值
    const allowResize = props.allowResize ?? false;

    // 初始化位置
    const [position, setPosition] = createSignal({
        x: props.initialPosition?.x ?? window.innerWidth / 2,
        y: props.initialPosition?.y ?? window.innerHeight / 2
    });

    // 保存容器引用
    let containerRef: HTMLDivElement | undefined;

    // 拖动相关变量
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    // 保存拖动前的尺寸
    let containerWidthBeforeDrag = '';
    let containerHeightBeforeDrag = '';

    // 确保容器在屏幕范围内
    const adjustPosition = () => {
        if (!containerRef) return;
        const rect = containerRef.getBoundingClientRect();
        const newX = Math.max(0, Math.min(position().x, window.innerWidth - rect.width));
        const newY = Math.max(0, Math.min(position().y, window.innerHeight - rect.height));

        containerRef.style.left = `${newX}px`;
        containerRef.style.top = `${newY}px`;
        setPosition({ x: newX, y: newY });
    };

    // 使用防抖减少频繁调用
    const debouncedAdjustPosition = debounce(adjustPosition, 20);

    // 窗口大小变化时调整位置
    const handleResize = () => {
        if (containerRef) {
            debouncedAdjustPosition();
        }
    };

    onMount(() => {
        if (containerRef) {
            // 如果未指定初始位置，则居中显示
            if (!props.initialPosition) {
                const rect = containerRef.getBoundingClientRect();
                const centerX = (window.innerWidth - rect.width) / 2;
                const centerY = (window.innerHeight - rect.height) / 2;
                setPosition({ x: centerX, y: centerY });
                containerRef.style.left = `${centerX}px`;
                containerRef.style.top = `${centerY}px`;
            } else {
                containerRef.style.left = `${position().x}px`;
                containerRef.style.top = `${position().y}px`;
            }
            // 限制位置不能超出屏幕
            adjustPosition();

            // 添加全局事件监听
            window.addEventListener('resize', handleResize);
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        if (props.onAfterMounted && containerRef) {
            props.onAfterMounted({
                container: containerRef,
                containerHeader: containerRef.querySelector('.floating-container-header') as HTMLDivElement,
                containerBody: containerRef.querySelector('.floating-container-body') as HTMLDivElement
            });
        }
    });

    onCleanup(() => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('resize', handleResize);
    });

    // 拖动开始
    const handleMouseDown = (e: MouseEvent) => {
        if (!containerRef) return;
        isDragging = true;
        const rect = containerRef.getBoundingClientRect();
        dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        // 保存当前尺寸
        containerWidthBeforeDrag = containerRef.style.width;
        containerHeightBeforeDrag = containerRef.style.height;

        e.preventDefault();
    };

    // 拖动过程
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging || !containerRef) return;

        const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - containerRef.offsetWidth));
        const newY = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - containerRef.offsetHeight));

        // 直接更新DOM位置
        containerRef.style.left = `${newX}px`;
        containerRef.style.top = `${newY}px`;

        e.preventDefault();
    };

    // 拖动结束
    const handleMouseUp = () => {
        if (!containerRef || !isDragging) return;
        isDragging = false;

        // 更新状态，保存最终位置
        setPosition({ x: containerRef.offsetLeft, y: containerRef.offsetTop });

        // 恢复拖动前保存的尺寸
        if (containerWidthBeforeDrag) {
            containerRef.style.width = containerWidthBeforeDrag;
        }

        if (containerHeightBeforeDrag) {
            containerRef.style.height = containerHeightBeforeDrag;
        }
    };

    // 关闭容器
    const handleClose = () => {
        if (props.onClose) {
            props.onClose();
        }
    };

    return (
        <div
            id={props.id}
            class='floating-container'
            ref={containerRef}
            style={{
                'position': 'fixed',
                'left': `${position().x}px`,
                'top': `${position().y}px`,
                'z-index': '999',
                'background-color': 'var(--b3-theme-background)',
                'border': '1px solid var(--b3-border-color)',
                'border-radius': '8px',
                'padding': '8px',
                'box-shadow': 'var(--b3-dialog-shadow)',
                'max-width': '95%',
                'max-height': '95%',
                'display': 'flex',
                'flex-direction': 'column',
                'user-select': 'none',
                'resize': allowResize ? 'both' : 'none',
                'overflow': 'auto', // Required for resize to work
                'min-width': '200px', // Add minimum dimensions
                'min-height': '100px',
                'will-change': 'left, top, width, height', // 优化渲染性能
                'overscroll-behavior': 'contain', // 防止滚动传播
                'touch-action': 'none', // 优化触摸设备上的交互
                ...(props.style || {})
            }}
        >
            <div
                class="floating-container-header"
                style={{
                    'display': 'flex',
                    'justify-content': 'space-between',
                    'align-items': 'center',
                    'cursor': 'move',
                    'padding-bottom': '4px',
                    'margin-bottom': '4px',
                    'border-bottom': '1px solid var(--b3-border-color)',
                    'flex-shrink': 0
                }}
                onMouseDown={handleMouseDown}
            >
                <div style={{ 'display': 'flex', 'align-items': 'center', 'gap': '8px' }}>
                    <IconSymbol size='13px'>iconAttr</IconSymbol>
                    <div
                        class="floating-container-title"
                        style={{
                            'font-size': '14px',
                            'font-weight': '500',
                            'color': 'var(--b3-theme-on-background)'
                        }}
                    >
                        {props.title}
                    </div>
                </div>
                <div
                    class="close-button"
                    onClick={handleClose}
                    style={{
                        'cursor': 'pointer',
                        'display': 'flex',
                        'align-items': 'center',
                        'justify-content': 'center',
                        'width': '18px',
                        'height': '18px',
                        'border-radius': '50%',
                        'background-color': 'var(--b3-theme-surface)',
                        'color': 'var(--b3-theme-on-surface)',
                        'font-size': '12px',
                        'line-height': '1',
                    }}
                >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </div>
            </div>
            <div class="floating-container-body" style={{
                'flex': '1 1 0%',
                'display': 'flex',
                'overflow': 'auto', // 只让 body 滚动
                'min-height': 0  // 让flex布局下body能收缩，避免header被挤走
            }}>
                {props.children}
            </div>
        </div>
    );
};

/**
 * 创建一个全局浮动容器
 * 通过传入 element 或 component 参数来指定内容
 *
 * @param args 参数
 * @param args.element DOM 元素
 * @param args.component Solid 组件
 * @param args.initialPosition 初始位置
 * @param args.style 样式
 * @param args.title 标题
 * @param args.onClose 关闭事件
 * @param args.allowResize 是否允许调整大小
 * @returns {{
 *   container: HTMLElement,
 *   containerBody: HTMLElement,
 *   dispose: () => void
 * }} 返回一个包含容器元素、内容区元素和销毁方法的对象
 */
export const floatingContainer = (args: {
    element?: HTMLElement;
    component?: () => JSXElement;
    title?: string;
    style?: Record<string, string>;
    initialPosition?: { x: number; y: number };
    onClose?: () => void;
    allowResize?: boolean;
}) => {
    if (!args.component && !args.element) {
        throw new Error('FloatingContainer: 必须提供 component 或 element 参数');
    }

    const container = document.createElement('div');
    container.style.display = 'contents';
    document.body.appendChild(container);

    let dispose: (() => void) | undefined;

    // 确保style中包含宽高
    const style = args.style ? { ...args.style } : {};
    if (!style.width) style.width = 'auto';
    if (!style.height) style.height = 'auto';

    // 定义销毁函数，清理所有资源
    const disposeAll = () => {
        if (dispose) {
            dispose();
            dispose = undefined;
        }
        if (container.parentNode) {
            container.remove();
        }
    };

    // 渲染浮动容器
    const containerProps = {
        initialPosition: args.initialPosition,
        style: style,
        title: args.title,
        onClose: () => {
            disposeAll();
            if (args.onClose) args.onClose();
        },
        allowResize: args.allowResize ?? false
    };

    // 处理两种不同的内容类型
    if (args.component) {
        // 使用 Solid 组件渲染
        const ContainerComponent = () => (
            <FloatingContainer {...containerProps}>
                {args.component!()}
            </FloatingContainer>
        );
        dispose = render(ContainerComponent, container);
    } else if (args.element) {
        // 使用普通 DOM 元素
        const ContainerComponent = () => (
            <FloatingContainer {...containerProps}>
                <div style={{ 'display': 'contents' }} ref={(el) => {
                    if (el && args.element && args.element.parentElement !== el) {
                        el.appendChild(args.element);
                    }
                }}></div>
            </FloatingContainer>
        );
        dispose = render(ContainerComponent, container);
    }

    // 返回对象，包含容器元素、内容区元素和销毁方法
    return {
        container: container,
        containerBody: container.querySelector('.floating-container-body') as HTMLElement,
        dispose: disposeAll
    };
};