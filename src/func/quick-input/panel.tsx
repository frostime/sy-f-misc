import { For, Show } from "solid-js";

import { solidDialog, simpleFormDialog } from "@/libs/dialog";

import { getTemplates } from "./config";
import { executeTemplate, QuickInputCancelled } from "./engine";
import type { QuickInputTemplate } from "./types";

const DEFAULT_GROUP = '默认';

const groupedTemplates = (templates: QuickInputTemplate[]) => {
    const groups = new Map<string, QuickInputTemplate[]>();
    for (const template of templates) {
        const group = template.group || DEFAULT_GROUP;
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(template);
    }
    return [...groups.entries()].map(([group, items]) => ({ group, items }));
};

function QuickInputPanel(props: { close: () => void }) {
    const templates = getTemplates();
    const groups = groupedTemplates(templates);

    const runTemplate = async (template: QuickInputTemplate) => {
        let values: Record<string, any> = {};
        const fields = template.declaredInputVar ?? [];
        if (fields.length > 0) {
            const result = await simpleFormDialog({
                title: template.name,
                fields,
                width: '640px',
                maxHeight: '80vh'
            });
            if (!result.ok) return;
            values = result.values ?? {};
        }

        try {
            props.close();
            await executeTemplate(template, values);
        } catch (error) {
            if (error instanceof QuickInputCancelled) return;
            console.error('[quick-input] execute failed', error);
        }
    };

    return (
        <div style={{ padding: '12px 16px', 'min-width': '420px' }}>
            <Show when={templates.length > 0} fallback={
                <div style={{ color: 'var(--b3-theme-on-surface-light)', 'text-align': 'center', padding: '24px 0' }}>
                    尚未配置 QuickInput 预设，请先到设置面板添加模板。
                </div>
            }>
                <For each={groups}>
                    {(group) => (
                        <section style={{ 'margin-bottom': '14px' }}>
                            <div style={{
                                'font-weight': 600,
                                'margin-bottom': '8px',
                                color: 'var(--b3-theme-on-surface)'
                            }}>
                                {group.group}
                            </div>
                            <div style={{ display: 'grid', 'grid-template-columns': 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                                <For each={group.items}>
                                    {(template) => (
                                        <div
                                            onClick={() => runTemplate(template)}
                                            style={{
                                                border: '1px solid var(--b3-border-color)',
                                                'border-radius': '6px',
                                                padding: '10px 12px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                'flex-direction': 'column',
                                                gap: '4px',
                                                transition: 'background-color 0.15s ease',
                                                'background-color': 'var(--b3-theme-background)'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--b3-theme-surface-light)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--b3-theme-background)')}
                                        >
                                            <div style={{
                                                'font-weight': 600,
                                                color: 'var(--b3-theme-on-surface)',
                                                'font-size': '14px',
                                                overflow: 'hidden',
                                                'text-overflow': 'ellipsis',
                                                'white-space': 'nowrap'
                                            }}>
                                                {template.icon ? `${template.icon} ` : ''}{template.name}
                                            </div>
                                            <Show when={template.description}>
                                                <div style={{
                                                    color: 'var(--b3-theme-on-surface-light)',
                                                    'font-size': '12px',
                                                    overflow: 'hidden',
                                                    'text-overflow': 'ellipsis',
                                                    'white-space': 'nowrap'
                                                }}>
                                                    {template.description}
                                                </div>
                                            </Show>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </section>
                    )}
                </For>
            </Show>
        </div>
    );
}

export const openPanel = async () => {
    let close = () => { };
    const dialog = solidDialog({
        title: 'QuickInput',
        loader: () => <QuickInputPanel close={() => close()} />,
        width: '560px',
        maxHeight: '80vh'
    });
    close = () => dialog.close();
};
