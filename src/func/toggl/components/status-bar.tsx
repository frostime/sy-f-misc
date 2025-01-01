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
                    'background-color': activeEntry() ? 'var(--b3-theme-primary)' : 'var(--b3-theme-surface-lighter)'
                }}
            />
            <Show when={activeEntry()}>
                <span style={{ 'max-width': '150px', 'overflow': 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                    {activeEntry()?.description || 'No description'}
                </span>
                <span>
                    {elapsedTime()}
                </span>
            </Show>
        </div>
    );
}; 