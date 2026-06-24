import { For, Show } from "solid-js";

import { solidDialog, simpleFormDialog } from "@/libs/dialog";
import { ButtonInput } from "@/libs/components/Elements";

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
            await executeTemplate(template, values);
            props.close();
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
                            <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px' }}>
                                <For each={group.items}>
                                    {(template) => (
                                        <ButtonInput
                                            label={`${template.icon ? `${template.icon} ` : ''}${template.name}`}
                                            onClick={() => runTemplate(template)}
                                            style={{ 'min-width': '120px' }}
                                        />
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
