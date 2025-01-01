import { Show, type Component } from 'solid-js';
import { activeEntry, elapsedTime } from '../state/active';

interface StatusBarProps {
    onClick: () => void;
}

export const TogglStatusBar: Component<StatusBarProps> = (props) => {
    return (
        <div
            onClick={props.onClick}
            classList={{
                'ariaLabel': true
            }}
            aria-label='Toggl Timer'
            style={{
                'display': 'flex',
                'align-items': 'center',
                'gap': '8px',
                'cursor': 'pointer',
                'height': '100%'
            }}
        >
            <div
                style={{
                    'width': '12px',
                    'height': '12px',
                    'border-radius': '50%',
                    'background-color': activeEntry() ? 'var(--b3-theme-primary)' : 'var(--b3-theme-surface-light)'
                }}
            />
            <Show when={activeEntry()}>
                <span style={{ 'max-width': '150px', 'overflow': 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', color: 'var(--b3-theme-primary)' }}>
                    <b>{activeEntry()?.description || 'No description'}</b>
                </span>
                <span style={{ color: 'var(--b3-theme-on-surface)' }}>
                    <b>{elapsedTime()}</b>
                </span>
            </Show>
        </div>
    );
}; 