import { createSignal, createEffect, type Component, For, onMount } from 'solid-js';
import { type Project, type Tag } from '../api/types';
import { startTimeEntry } from '../api/time_entries';
import { getProjects, getTags } from '../api/me';
import { activeEntry, isLoading, stopEntry, syncWithServer } from '../store/active';

import { me } from '../store';
import { createSignalRef } from '@frostime/solid-signal-ref';

interface ClientProps {
    onClose: () => void;
}

const buttonStyle = {
    padding: '8px 16px',
    border: 'none',
    'border-radius': '4px',
    color: 'var(--b3-theme-on-primary)',
    cursor: 'pointer'
};

const containerStyle = {
    padding: '16px',
    'min-width': '300px',
    'background-color': 'var(--b3-theme-background)'
};

const sectionStyle = {
    'margin-bottom': '16px'
};

const inputStyle = {
    width: '100%',
    padding: '8px',
    'border-radius': '4px',
    border: '1px solid var(--b3-theme-surface-lighter)',
    'background-color': 'var(--b3-theme-surface)',
    color: 'var(--b3-theme-on-surface)'
};

const tagLabelStyle = {
    display: 'flex',
    'align-items': 'center',
    gap: '4px',
    padding: '4px 8px',
    'border-radius': '4px',
    cursor: 'pointer',
    'background-color': 'var(--b3-theme-surface)',
    color: 'var(--b3-theme-on-surface)'
};

const actionContainerStyle = {
    display: 'flex',
    'justify-content': 'flex-end',
    gap: '8px'
};

export const TogglClient: Component<ClientProps> = (props) => {
    const description = createSignalRef('');
    const projects = createSignalRef<Project[]>([]);
    const tags = createSignalRef<Tag[]>([]);
    const selectedProject = createSignalRef<number | null>(null);
    const selectedTags = createSignalRef<number[]>([]);

    onMount(async () => {
        const [projectsRes, tagsRes] = await Promise.all([
            getProjects(),
            getTags()
        ]);

        if (projectsRes.ok) {
            projects(projectsRes.data);
        }

        if (tagsRes.ok) {
            tags(tagsRes.data);
        }

        // Set initial values from active entry
        const entry = activeEntry();
        if (entry) {
            description(entry.description || '');
            selectedProject(entry.project_id || null);
            selectedTags(entry.tag_ids || []);
        }
    });

    const handleStartStop = async () => {
        const currentUser = me();
        if (isLoading() || !currentUser) return;
        isLoading(true);

        try {
            if (activeEntry()) {
                await stopEntry();
            } else {
                // Start a new entry
                const response = await startTimeEntry({
                    description: description(),
                    project_id: selectedProject() || undefined,
                    tag_ids: selectedTags(),
                    workspace_id: currentUser.default_workspace_id
                });
                if (response.ok) {
                    activeEntry(response.data);
                }
            }
        } catch (error) {
            console.error('Error in start/stop:', error);
        } finally {
            isLoading(false);
        }
    };

    const handleUpdate = async () => {
        const currentEntry = activeEntry();
        if (!currentEntry || isLoading()) return;
        isLoading(true);

        try {
            // Stop current entry and start a new one with updated values
            await stopEntry();
            const currentUser = me();
            if (!currentUser) return;

            const response = await startTimeEntry({
                description: description(),
                project_id: selectedProject() || undefined,
                tag_ids: selectedTags(),
                workspace_id: currentUser.default_workspace_id
            });

            if (response.ok) {
                activeEntry(response.data);
                props.onClose();
            }
        } catch (error) {
            console.error('Error in update:', error);
        } finally {
            isLoading(false);
        }
    };

    return (
        <div style={containerStyle}>
            <div style={sectionStyle}>
                <button
                    onClick={handleStartStop}
                    disabled={isLoading() || !me()}
                    style={{
                        ...buttonStyle,
                        'background-color': activeEntry() ? 'var(--b3-theme-error)' : 'var(--b3-theme-primary)',
                        cursor: (isLoading() || !me()) ? 'not-allowed' : 'pointer',
                        opacity: (isLoading() || !me()) ? 0.7 : 1
                    }}
                >
                    {isLoading() ? 'Loading...' : (activeEntry() ? 'Stop' : 'Start')}
                </button>
                <button
                    onClick={syncWithServer}
                    style={{
                        ...buttonStyle,
                        'background-color': 'var(--b3-theme-primary)',
                        cursor: 'pointer'
                    }}
                >
                    同步状态
                </button>
            </div>

            <div style={sectionStyle}>
                <input
                    type="text"
                    value={description()}
                    onInput={(e) => description(e.currentTarget.value)}
                    placeholder="What are you working on?"
                    disabled={isLoading()}
                    style={inputStyle}
                />
            </div>

            <div style={sectionStyle}>
                <select
                    value={selectedProject()?.toString() || ''}
                    onChange={(e) => selectedProject(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
                    disabled={isLoading()}
                    style={inputStyle}
                >
                    <option value="">Select Project</option>
                    <For each={projects()}>
                        {(project) => (
                            <option value={project.id}>
                                {project.name}
                            </option>
                        )}
                    </For>
                </select>
            </div>

            <div style={sectionStyle}>
                <div style={sectionStyle}>Tags:</div>
                <div style={{
                    display: 'flex',
                    'flex-wrap': 'wrap',
                    gap: '8px'
                }}>
                    <For each={tags()}>
                        {(tag) => (
                            <label
                                style={{
                                    ...tagLabelStyle,
                                    'background-color': selectedTags().includes(tag.id) ? 'var(--b3-theme-primary-light)' : 'var(--b3-theme-surface)',
                                    cursor: isLoading() ? 'not-allowed' : 'pointer',
                                    opacity: isLoading() ? 0.7 : 1
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedTags().includes(tag.id)}
                                    disabled={isLoading()}
                                    onChange={(e) => {
                                        if (e.currentTarget.checked) {
                                            selectedTags([...selectedTags(), tag.id]);
                                        } else {
                                            selectedTags(selectedTags().filter(id => id !== tag.id));
                                        }
                                    }}
                                />
                                {tag.name}
                            </label>
                        )}
                    </For>
                </div>
            </div>

            <div style={actionContainerStyle}>
                <button
                    onClick={props.onClose}
                    disabled={isLoading()}
                    style={{
                        ...buttonStyle,
                        'background-color': 'var(--b3-theme-surface-lighter)',
                        cursor: isLoading() ? 'not-allowed' : 'pointer',
                        opacity: isLoading() ? 0.7 : 1
                    }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleUpdate}
                    disabled={!activeEntry() || isLoading()}
                    style={{
                        ...buttonStyle,
                        'background-color': 'var(--b3-theme-primary)',
                        cursor: (!activeEntry() || isLoading()) ? 'not-allowed' : 'pointer',
                        opacity: (!activeEntry() || isLoading()) ? 0.7 : 1
                    }}
                >
                    {isLoading() ? 'Updating...' : 'Update'}
                </button>
            </div>
        </div>
    );
}; 