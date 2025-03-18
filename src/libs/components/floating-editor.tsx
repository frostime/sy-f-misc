/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-04-16
 * @FilePath     : /src/libs/components/floating-editor.tsx
 * @Description  : 浮动文本编辑器组件
 */

import { type Component, createSignal } from 'solid-js';
import { TextArea } from './Elements';
import { ButtonInput } from './Elements';
import { floatingContainer } from './floating-container';

/**
 * 浮动文本编辑器组件
 */
export const FloatingEditor: Component<{
    initialText?: string;
    onConfirm?: (text: string) => void;
    onCancel?: () => void;
    placeholder?: string;
    style?: Record<string, string>;
    textAreaStyle?: Record<string, string>;
    title?: string;
}> = (props) => {
    const [text, setText] = createSignal(props.initialText || '');

    const handleConfirm = () => {
        if (props.onConfirm) {
            props.onConfirm(text());
        }
    };

    const handleCancel = () => {
        if (props.onCancel) {
            props.onCancel();
        }
    };

    return (
        <div style={{ 'display': 'flex', 'flex-direction': 'column', 'gap': '8px', 'width': '100%', 'height': '100%' }}>
            <TextArea
                value={text()}
                changed={setText}
                spellcheck={false}
                style={{
                    'flex': '1',
                    'min-height': '100px',
                    'width': '100%',
                    'resize': 'none',
                    ...(props.textAreaStyle || {})
                }}
            />
            <div style={{ 'display': 'flex', 'justify-content': 'flex-end', 'gap': '8px' }}>
                <ButtonInput
                    label="取消"
                    classText={true}
                    onClick={handleCancel}
                />
                <ButtonInput
                    label="确认"
                    onClick={handleConfirm}
                />
            </div>
        </div>
    );
};

/**
 * 创建一个浮动文本编辑器
 * 
 * @param args 参数
 * @param args.initialText 初始文本
 * @param args.onConfirm 确认回调
 * @param args.onCancel 取消回调
 * @param args.placeholder 占位文本
 * @param args.style 容器样式
 * @param args.textAreaStyle 文本区域样式
 * @param args.title 标题
 * @param args.initialPosition 初始位置
 * @returns {{
 *   container: HTMLElement,
 *   containerBody: HTMLElement,
 *   dispose: () => void
 * }} 返回一个包含容器元素、内容区元素和销毁方法的对象
 */
export const floatingEditor = (args: {
    initialText?: string;
    onConfirm?: (text: string) => void;
    onCancel?: () => void;
    placeholder?: string;
    style?: Record<string, string>;
    textAreaStyle?: Record<string, string>;
    title?: string;
    initialPosition?: { x: number; y: number };
}) => {
    // 设置默认样式
    const style = args.style ? { ...args.style } : {};
    if (!style.width) style.width = '400px';
    if (!style.height) style.height = '300px';

    // 创建浮动容器
    const container = floatingContainer({
        component: () => (
            <FloatingEditor
                initialText={args.initialText}
                onConfirm={(text) => {
                    if (args.onConfirm) {
                        args.onConfirm(text);
                    }
                    container.dispose();
                }}
                onCancel={() => {
                    if (args.onCancel) {
                        args.onCancel();
                    }
                    container.dispose();
                }}
                placeholder={args.placeholder}
                textAreaStyle={args.textAreaStyle}
                title={args.title}
            />
        ),
        title: args.title || '文本编辑器',
        style: style,
        initialPosition: args.initialPosition,
        onClose: () => {
            if (args.onCancel) {
                args.onCancel();
            }
        },
        allowResize: true
    });

    return container;
};