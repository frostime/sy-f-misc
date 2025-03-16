/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-16
 * @FilePath     : /src/libs/components/floating-container.tsx
 * @Description  : 全局浮动容器组件
 */

import { type Component, createSignal, onCleanup, onMount, JSXElement } from 'solid-js';
import { render } from 'solid-js/web';

interface FloatingContainerProps {
    children: JSXElement;
    onClose?: () => void;
    initialPosition?: { x: number; y: number };
    minWidth?: string;
    minHeight?: string;
    maxWidth?: string;
    maxHeight?: string;
    style?: Record<string, string>;
}

/**
 * 浮动容器组件
 */
export const FloatingContainer: Component<FloatingContainerProps> = (props) => {
    const initialX = props.initialPosition?.x ?? window.innerWidth - 250;
    const initialY = props.initialPosition?.y ?? window.innerHeight - 150;

    const [position, setPosition] = createSignal({ x: initialX, y: initialY });
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let containerRef: HTMLDivElement;

    const adjustPosition = () => {
        if (!containerRef) return;
        const rect = containerRef.getBoundingClientRect();
        const newX = Math.max(0, Math.min(position().x, window.innerWidth - rect.width));
        const newY = Math.max(0, Math.min(position().y, window.innerHeight - rect.height));

        containerRef.style.left = `${newX}px`;
        containerRef.style.top = `${newY}px`;
        setPosition({ x: newX, y: newY });
    };

    const handleResize = () => {
        if (containerRef) {
            containerRef.style.transition = 'all 0.3s ease';
            adjustPosition();
        }
    };

    onMount(() => {
        // 初始化位置
        if (containerRef) {
            containerRef.style.left = `${position().x}px`;
            containerRef.style.top = `${position().y}px`;
        }
        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    });

    onCleanup(() => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('resize', handleResize);
    });

    const handleMouseDown = (e: MouseEvent) => {
        if (!containerRef) return;
        isDragging = true;
        const rect = containerRef.getBoundingClientRect();
        dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        // 添加拖动时的样式
        containerRef.style.transition = 'none';
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging || !containerRef) return;

        const rect = containerRef.getBoundingClientRect();
        const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - rect.width));
        const newY = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - rect.height));

        // 直接更新 DOM 样式，而不是通过状态更新
        containerRef.style.left = `${newX}px`;
        containerRef.style.top = `${newY}px`;
        e.preventDefault();
    };

    const handleMouseUp = () => {
        if (!containerRef || !isDragging) return;
        isDragging = false;
        // 恢复过渡动画
        containerRef.style.transition = 'all 0.3s ease';
        // 更新状态，保存最终位置
        const rect = containerRef.getBoundingClientRect();
        setPosition({ x: rect.left, y: rect.top });
    };

    const handleClose = () => {
        if (props.onClose) {
            props.onClose();
        }
    };

    return (
        <div
            ref={containerRef!}
            style={{
                'position': 'fixed',
                'left': `${position().x}px`,
                'top': `${position().y}px`,
                'z-index': '9999',
                'background-color': 'var(--b3-theme-background)',
                'border': '1px solid var(--b3-theme-on-surface)',
                'border-radius': '8px',
                'padding': '8px',
                'box-shadow': '0 2px 8px rgba(0, 0, 0, 0.15)',
                'transition': 'all 0.3s ease',
                'min-width': props.minWidth || '150px',
                'min-height': props.minHeight || 'auto',
                'max-width': props.maxWidth || 'none',
                'max-height': props.maxHeight || 'none',
                'display': 'flex',
                'flex-direction': 'column',
                'user-select': 'none',
                ...props.style
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
                    'border-bottom': '1px solid var(--b3-border-color)'
                }}
                onMouseDown={handleMouseDown}
            >
                <div class="drag-handle" style={{ 'width': '16px', 'height': '4px', 'background-color': 'var(--b3-border-color)', 'border-radius': '2px' }}></div>
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
            <div class="floating-container-content" style={{ 'flex': '1' }}>
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
 * @param args.minWidth 最小宽度
 * @param args.minHeight 最小高度
 * @param args.maxWidth 最大宽度
 * @param args.maxHeight 最大高度
 * @param args.style 样式
 * @param args.onClose 关闭事件
 * @returns {{dispose: () => void}} 返回一个包含 dispose 方法的对象，用于销毁容器
 */
export const floatingContainer = (args: {
    element?: HTMLElement;
    component?: () => JSXElement;
    initialPosition?: { x: number; y: number };
    minWidth?: string;
    minHeight?: string;
    maxWidth?: string;
    maxHeight?: string;
    style?: Record<string, string>;
    onClose?: () => void;
}) => {
    if (!args.component && !args.element) {
        console.error('FloatingContainer: 必须提供 loader 或 element 参数');
        return { dispose: () => { } };
    }

    const container = document.createElement('div');
    container.style.display = 'contents';
    document.body.appendChild(container);

    let dispose: (() => void) | undefined;

    // 渲染浮动容器
    const containerProps = {
        initialPosition: args.initialPosition,
        minWidth: args.minWidth,
        minHeight: args.minHeight,
        maxWidth: args.maxWidth,
        maxHeight: args.maxHeight,
        style: args.style,
        onClose: () => {
            disposeAll();
            if (args.onClose) args.onClose();
        }
    };

    // 处理两种不同的内容类型
    if (args.component) {
        // 使用 Solid 组件渲染
        const ContainerComponent = () => (
            <FloatingContainer {...containerProps}>
                {args.component()}
            </FloatingContainer>
        );
        dispose = render(ContainerComponent, container);
    } else if (args.element) {
        // 使用普通 DOM 元素
        const ContainerComponent = () => (
            <FloatingContainer {...containerProps}>
                <div ref={(el) => {
                    if (el && args.element) {
                        el.appendChild(args.element);
                    }
                }}></div>
            </FloatingContainer>
        );
        dispose = render(ContainerComponent, container);
    }

    // 销毁函数，清理所有资源
    const disposeAll = () => {
        if (dispose) {
            dispose();
            dispose = undefined;
        }
        container.remove();
    };

    // 返回对象，包含销毁方法
    return {
        dispose: disposeAll
    };
};