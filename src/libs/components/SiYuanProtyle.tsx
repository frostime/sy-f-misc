import { onMount, onCleanup, JSX } from 'solid-js';
import { Protyle, IProtyleOptions, App } from 'siyuan';
import { thisPlugin } from '@frostime/siyuan-plugin-kits';

/**
 * SiYuanProtyle 组件
 * 将 Siyuan Protyle 编辑器挂载到 div 容器中，并支持自定义配置
 * @prop {IProtyleOptions} options - Protyle 编辑器配置选项
 * @prop {App} app - Siyuan 应用实例，默认为当前插件的应用实例
 * @prop {string} class - 容器额外 class
 * @prop {JSX.CSSProperties} style - 容器行内样式
 * @prop {(container: HTMLDivElement) => void} onContainerMounted - 容器挂载完成后的回调函数
 */
export function SiYuanProtyle(props: {
    options?: IProtyleOptions;
    app?: App;
    class?: string;
    style?: JSX.CSSProperties;
    onContainerMounted?: (container: HTMLDivElement) => void;
}) {
    let containerRef: HTMLDivElement | undefined;
    let protyleInstance: Protyle;

    onMount(() => {
        if (!containerRef) return;
        let app = props?.app;
        if (!app) {
            let plugin = thisPlugin();
            app = plugin?.app;
        }
        protyleInstance = new Protyle(
            app,
            containerRef,
            props.options
        );

        if (props.onContainerMounted) {
            props.onContainerMounted(containerRef);
        }
    });

    onCleanup(() => {
        protyleInstance.destroy();
        // 清理容器内容
        if (containerRef) {
            containerRef.innerHTML = '';
        }
    });

    return (
        <div
            ref={el => (containerRef = el)}
            class={props.class}
            style={props.style}
        />
    );
}
