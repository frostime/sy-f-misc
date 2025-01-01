import { Show, type Component, createSignal, onCleanup, onMount } from 'solid-js';
import { activeEntry, elapsedTime } from '../state/active';

interface StatusBarProps {
    onClick: () => void;
}

export const TogglStatusBar: Component<StatusBarProps> = (props) => {
    const [isCollapsed, setIsCollapsed] = createSignal(false);
    const [position, setPosition] = createSignal({ x: window.innerWidth - 200, y: window.innerHeight - 100 });
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

    // 添加全局事件监听
    if (typeof window !== 'undefined') {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    return (
        <div
            ref={containerRef!}
            style={{
                'position': 'fixed',
                'left': `${position().x}px`,
                'top': `${position().y}px`,
                'z-index': '9999',
                'background-color': 'var(--b3-theme-background)',
                'border': activeEntry() ? '1px solid var(--b3-theme-primary)' : '1px solid var(--b3-theme-on-surface)',
                'border-radius': '8px',
                'padding': '8px',
                'box-shadow': '0 2px 8px rgba(0, 0, 0, 0.15)',
                'transition': 'all 0.3s ease',
                'min-width': isCollapsed() ? '32px' : '150px',
                'display': 'flex',
                'align-items': 'center',
                'gap': '2px',
                'user-select': 'none'
            }}
            onDblClick={() => props.onClick()}
            onMouseDown={!isCollapsed() ? handleMouseDown : undefined}
        >
            <div
                style={{
                    'width': '12px',
                    'height': '12px',
                    'border-radius': '50%',
                    'background-color': 'var(--b3-theme-primary)',
                    'opacity': activeEntry() ? 1 : 0.5,
                    'flex-shrink': '0'
                }}
            />
            <Show when={!isCollapsed() && activeEntry()}>
                <div style={{
                    cursor: 'move'
                }}>
                    <span style={{ 'max-width': '150px', 'overflow': 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', color: 'var(--b3-theme-primary)' }}>
                        <b>{activeEntry()?.description || 'No description'}</b>
                    </span>
                    <span style={{ color: 'var(--b3-theme-on-surface)', 'flex-shrink': '0' }}>
                        <b>{elapsedTime()}</b>
                    </span>
                </div>
            </Show>
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    setIsCollapsed(!isCollapsed());
                }}
                style={{
                    'cursor': 'pointer',
                    'margin-left': 'auto',
                    'padding': '4px',
                    'flex-shrink': '0'
                }}
            >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    {isCollapsed() ? (
                        <path d="M7 14l5-5 5 5z" />
                    ) : (
                        <path d="M7 10l5 5 5-5z" />
                    )}
                </svg>
            </div>
        </div>
    );
}; 