import { type Component, For, onMount, JSX } from 'solid-js';
// import { type Project, type Tag } from '../api/types';
import { getProjects, getTags } from '../api/me';
import { activeEntry, isLoading, stopEntry, syncEntry, startEntry, updateEntry } from '../state/active';

import { me, tags, projects } from '../state/config';
import { createSignalRef } from '@frostime/solid-signal-ref';
import { showMessage } from 'siyuan';


const buttonStyle = {
    padding: '8px 16px',
    border: 'none',
    'border-radius': '4px',
    color: 'var(--b3-theme-on-primary)',
    cursor: 'pointer'
};

const sectionStyle: JSX.CSSProperties = {
    'margin-bottom': '16px',
    display: 'flex',
    'flex-direction': 'column',
    'gap': '4px'
};

const inputStyle: JSX.CSSProperties = {
    // width: '100%',
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
    // 'justify-content': 'flex-end',
    gap: '8px'
};

export const TogglClient: Component = () => {
    const description = createSignalRef('');

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
                description('');
                selectedProject(null);
                selectedTags([]);
                showMessage(`停止 toggl 活动: ${activeEntry()?.description}`, 3000, 'info');
            } else {
                startEntry({
                    description: description(),
                    project_id: selectedProject() || undefined,
                    tag_ids: selectedTags(),
                });
                showMessage(`开始 toggl 活动: ${description()}`, 3000, 'info');
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
            // await stopEntry();
            updateEntry({
                description: description(),
                project_id: selectedProject() || undefined,
                tag_ids: selectedTags()
            });
            showMessage(`更新 toggl 活动: ${description()}`, 3000, 'info');
        } catch (error) {
            console.error('Error in update:', error);
        } finally {
            isLoading(false);
        }
    };

    return (
        <div style={{
            padding: '16px',
            'width': '100%',
            'background-color': 'var(--b3-theme-background)',
            'overflow-x': 'hidden'
        }}>

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
                <div class="fn__flex-1"></div>
                <button
                    onClick={() => syncEntry()}
                    disabled={isLoading()}
                    style={{
                        ...buttonStyle,
                        'background-color': 'var(--b3-theme-primary)',
                        cursor: 'pointer'
                    }}
                >
                    Pull State
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
                    {isLoading() ? 'Pushing...' : 'Push State'}
                </button>
            </div>
        </div>
    );
}; 