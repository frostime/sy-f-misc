import { createMemo, createSignal, For, Show } from "solid-js";
import { showMessage } from "siyuan";
import { getBlockByID } from "@frostime/siyuan-plugin-kits/api";

import { simpleFormDialog } from "@/libs/dialog";
import SimpleForm from "@/libs/components/simple-form";
import type { SimpleFormField } from "@/libs/components/simple-form";
import { ButtonInput, CheckboxInput, SelectInput, TextArea, TextInput } from "@/libs/components/Elements";

import { getTemplates, saveTemplates } from "./config";
import type { DeclaredInputType, DeclaredVar, InsertMode, InsertTo, QuickInputTemplate } from "./types";

const INPUT_TYPE_OPTIONS: Record<DeclaredInputType, string> = {
    text: '文本',
    textarea: '多行文本',
    number: '数字',
    checkbox: '开关',
    select: '下拉选择'
};

const INSERT_TYPE_OPTIONS = {
    document: '新建文档',
    block: '插入块'
};

const MODE_OPTIONS: Record<InsertMode, string> = {
    append: '作为末尾子块',
    prepend: '作为首个子块',
    before: '作为前一个同级块',
    after: '作为后一个同级块'
};

const now = () => Date.now();

const newTemplate = (): QuickInputTemplate => ({
    id: crypto.randomUUID(),
    name: '未命名模板',
    group: '默认',
    icon: '📝',
    insertTo: {
        type: 'document',
        notebook: '',
        hpath: '/QuickInput/${date}-${title}'
    },
    declaredInputVar: [
        {
            key: 'title',
            type: 'text',
            label: '标题',
            value: ''
        }
    ],
    template: '# ${title}\n',
    openBlock: true,
    createdAt: now(),
    updatedAt: now()
});

const clone = <T,>(value: T): T => structuredClone(value);

const optionsToText = (options?: Record<string, string>) => {
    return Object.entries(options ?? {}).map(([key, value]) => key === value ? key : `${key}=${value}`).join('\n');
};

const textToOptions = (text: string): Record<string, string> => {
    const entries = text.split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const index = line.indexOf('=');
            if (index < 0) return [line, line];
            return [line.slice(0, index).trim(), line.slice(index + 1).trim() || line.slice(0, index).trim()];
        })
        .filter(([key]) => key);
    return Object.fromEntries(entries);
};

const normalizeFieldValue = (type: DeclaredInputType, value: any) => {
    if (type === 'checkbox') return Boolean(value);
    if (type === 'number') {
        if (value === '' || value === undefined || value === null) return '';
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : '';
    }
    return value ?? '';
};

function TemplateEditor(props: {
    template: QuickInputTemplate;
    onPatch: (patch: Partial<QuickInputTemplate>) => void;
    onReplaceInsertTo: (insertTo: InsertTo) => void;
    onReplaceFields: (fields: DeclaredVar[]) => void;
}) {
    const [preview, setPreview] = createSignal('');

    const baseFields = (): SimpleFormField[] => [
        { key: 'name', label: '名称', type: 'text', value: props.template.name },
        { key: 'icon', label: '图标', type: 'text', value: props.template.icon ?? '' },
        { key: 'group', label: '分组', type: 'text', value: props.template.group ?? '' },
        { key: 'openBlock', label: '插入后打开', type: 'checkbox', value: props.template.openBlock !== false }
    ];

    const updateInsertTo = (patch: Partial<InsertTo>) => {
        props.onReplaceInsertTo({ ...props.template.insertTo, ...patch } as InsertTo);
    };

    const switchInsertType = (type: InsertTo['type']) => {
        const current = props.template.insertTo;
        if (type === current.type) return;
        if (type === 'document') {
            props.onReplaceInsertTo({
                type: 'document',
                notebook: current.type === 'block' ? (current.notebook ?? '') : current.notebook,
                hpath: '/QuickInput/${date}-${title}'
            });
        } else {
            props.onReplaceInsertTo({
                type: 'block',
                anchorId: '',
                mode: 'append',
                notebook: current.type === 'document' ? current.notebook : current.notebook
            });
        }
    };

    const updateField = (index: number, patch: Partial<DeclaredVar>) => {
        const fields = clone(props.template.declaredInputVar ?? []);
        const next = { ...fields[index], ...patch } as DeclaredVar;
        if (patch.type) {
            next.value = normalizeFieldValue(patch.type, next.value);
            if (patch.type === 'select' && !next.options) next.options = { option: '选项' };
            if (patch.type !== 'select') delete next.options;
        }
        fields[index] = next;
        props.onReplaceFields(fields);
    };

    const addField = () => {
        props.onReplaceFields([
            ...(props.template.declaredInputVar ?? []),
            {
                key: 'field',
                label: '字段',
                type: 'text',
                value: ''
            }
        ]);
    };

    const removeField = (index: number) => {
        props.onReplaceFields((props.template.declaredInputVar ?? []).filter((_, i) => i !== index));
    };

    const checkAnchor = async () => {
        if (props.template.insertTo.type !== 'block') return;
        const anchorId = props.template.insertTo.anchorId.trim();
        if (!anchorId || anchorId.includes('${')) {
            setPreview('请先填写固定块 ID；包含 ${...} 的动态 anchor 需运行时验证。');
            return;
        }
        try {
            const block = await getBlockByID(anchorId) as any;
            if (!block) {
                setPreview('未找到块');
                showMessage('未找到目标块', 3000, 'error');
                return;
            }
            setPreview(`${block.type ?? ''} ${block.content ?? ''}`.trim() || anchorId);
            showMessage('目标块有效');
        } catch (error) {
            console.error('[quick-input] check anchor failed', error);
            setPreview('校验失败');
            showMessage('校验目标块失败', 3000, 'error');
        }
    };

    const needsDailynoteNotebook = () => {
        return props.template.insertTo.type === 'block' && props.template.insertTo.anchorId.includes('${todayDailynoteId}');
    };

    const fillDailyNote = async () => {
        const currentNotebook = props.template.insertTo.type === 'document'
            ? props.template.insertTo.notebook
            : (props.template.insertTo.notebook ?? '');
        const result = await simpleFormDialog({
            title: '插入今日日记',
            fields: [
                {
                    key: 'notebook',
                    label: '日记本 ID',
                    type: 'text',
                    value: currentNotebook,
                    description: '用于 createDailynote(notebook) 解析 ${todayDailynoteId}'
                }
            ]
        });
        if (!result.ok) return;
        props.onReplaceInsertTo({
            type: 'block',
            anchorId: '${todayDailynoteId}',
            mode: 'append',
            notebook: String(result.values?.notebook ?? '')
        });
        showMessage('已填充“插入今日日记”样板');
    };

    const renderDefaultValueEditor = (field: DeclaredVar, index: number) => {
        if (field.type === 'checkbox') {
            return <CheckboxInput checked={Boolean(field.value)} changed={(value) => updateField(index, { value })} />;
        }
        if (field.type === 'select') {
            return (
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
                    <TextInput value={String(field.value ?? '')} placeholder="默认值" onChanged={(value) => updateField(index, { value })} />
                    <TextArea
                        value={optionsToText(field.options)}
                        onChanged={(value) => updateField(index, { options: textToOptions(value) })}
                        style={{ height: '64px' }}
                    />
                </div>
            );
        }
        return <TextInput value={String(field.value ?? '')} placeholder="默认值" onChanged={(value) => updateField(index, { value: normalizeFieldValue(field.type, value) })} />;
    };

    return (
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
            <section class="b3-label">
                <div class="b3-label__text" style={{ 'font-weight': 600, 'margin-bottom': '8px' }}>基础信息</div>
                <SimpleForm
                    fields={baseFields()}
                    onChange={(key, value) => props.onPatch({ [key]: value } as Partial<QuickInputTemplate>)}
                    labelWidth="90px"
                />
            </section>

            <section class="b3-label">
                <div class="b3-label__text" style={{ 'font-weight': 600, 'margin-bottom': '8px' }}>插入位置</div>
                <div style={{ display: 'grid', 'grid-template-columns': '120px 1fr', gap: '8px 12px', 'align-items': 'center' }}>
                    <label>类型</label>
                    <SelectInput
                        value={props.template.insertTo.type}
                        options={INSERT_TYPE_OPTIONS}
                        changed={(value) => switchInsertType(value as InsertTo['type'])}
                    />
                    <Show when={props.template.insertTo.type === 'document'}>
                        <label>笔记本 ID</label>
                        <TextInput
                            value={(props.template.insertTo as Extract<InsertTo, { type: 'document' }>).notebook}
                            onChanged={(value) => updateInsertTo({ notebook: value } as Partial<InsertTo>)}
                        />
                        <label>文档 hpath</label>
                        <TextInput
                            value={(props.template.insertTo as Extract<InsertTo, { type: 'document' }>).hpath}
                            onChanged={(value) => updateInsertTo({ hpath: value } as Partial<InsertTo>)}
                            placeholder="/QuickInput/${date}-${title}"
                        />
                    </Show>
                    <Show when={props.template.insertTo.type === 'block'}>
                        <label>anchorId</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <TextInput
                                value={(props.template.insertTo as Extract<InsertTo, { type: 'block' }>).anchorId}
                                onChanged={(value) => updateInsertTo({ anchorId: value } as Partial<InsertTo>)}
                                placeholder="块 ID 或 ${todayDailynoteId}"
                                style={{ flex: 1 }}
                            />
                            <ButtonInput label="校验" onClick={checkAnchor} />
                        </div>
                        <label>插入方式</label>
                        <SelectInput
                            value={(props.template.insertTo as Extract<InsertTo, { type: 'block' }>).mode}
                            options={MODE_OPTIONS}
                            changed={(value) => updateInsertTo({ mode: value as InsertMode } as Partial<InsertTo>)}
                        />
                        <Show when={needsDailynoteNotebook()}>
                            <label>日记本 ID</label>
                            <TextInput
                                value={(props.template.insertTo as Extract<InsertTo, { type: 'block' }>).notebook ?? ''}
                                onChanged={(value) => updateInsertTo({ notebook: value } as Partial<InsertTo>)}
                                placeholder="anchorId 引用 ${todayDailynoteId} 时必填"
                            />
                        </Show>
                        <label />
                        <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
                            <ButtonInput label="插入今日日记" onClick={fillDailyNote} />
                            <span style={{ color: 'var(--b3-theme-on-surface-light)' }}>{preview()}</span>
                        </div>
                    </Show>
                </div>
            </section>

            <section class="b3-label">
                <div class="b3-label__text" style={{ 'font-weight': 600, 'margin-bottom': '8px' }}>内容模板</div>
                <TextArea
                    value={props.template.template ?? ''}
                    onChanged={(value) => props.onPatch({ template: value })}
                    style={{ width: '100%', height: '180px', 'font-family': 'var(--b3-font-family-code)' }}
                />
                <div style={{ color: 'var(--b3-theme-on-surface-light)', 'font-size': '12px', 'margin-top': '4px' }}>
                    使用 ${'{var}'} 插值；思源 IAL 可写在模板中，例如 {'{: custom-type="demo"}'}。
                </div>
            </section>

            <section class="b3-label">
                <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '8px' }}>
                    <div class="b3-label__text" style={{ 'font-weight': 600 }}>输入字段</div>
                    <ButtonInput label="添加字段" onClick={addField} />
                </div>
                <For each={props.template.declaredInputVar ?? []}>
                    {(field, index) => (
                        <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr 120px 1fr auto', gap: '8px', 'align-items': 'center', 'margin-bottom': '8px' }}>
                            <TextInput value={field.key} placeholder="key" onChanged={(value) => updateField(index(), { key: value })} />
                            <TextInput value={field.label ?? ''} placeholder="label" onChanged={(value) => updateField(index(), { label: value })} />
                            <SelectInput value={field.type} options={INPUT_TYPE_OPTIONS} changed={(value) => updateField(index(), { type: value as DeclaredInputType })} />
                            {renderDefaultValueEditor(field, index())}
                            <ButtonInput label="删除" classOutlined={true} onClick={() => removeField(index())} />
                        </div>
                    )}
                </For>
            </section>
        </div>
    );
}

export default function QuickInputSetting() {
    const [templates, setTemplates] = createSignal(getTemplates());
    const [selectedId, setSelectedId] = createSignal(templates()[0]?.id ?? '');

    const selectedTemplate = createMemo(() => templates().find(template => template.id === selectedId()) ?? null);

    const persist = (next: QuickInputTemplate[]) => {
        setTemplates(next);
        saveTemplates(next).catch((error) => {
            console.error('[quick-input] save templates failed', error);
            showMessage('保存 QuickInput 模板失败', 3000, 'error');
        });
    };

    const patchSelected = (patch: Partial<QuickInputTemplate>) => {
        const id = selectedId();
        const next = templates().map(template => template.id === id ? {
            ...template,
            ...patch,
            updatedAt: now()
        } : template);
        persist(next);
    };

    const replaceInsertTo = (insertTo: InsertTo) => patchSelected({ insertTo });
    const replaceFields = (declaredInputVar: DeclaredVar[]) => patchSelected({ declaredInputVar });

    const addTemplate = () => {
        const template = newTemplate();
        persist([...templates(), template]);
        setSelectedId(template.id);
    };

    const removeTemplate = () => {
        const id = selectedId();
        const next = templates().filter(template => template.id !== id);
        persist(next);
        setSelectedId(next[0]?.id ?? '');
    };

    const moveSelected = (direction: -1 | 1) => {
        const current = templates();
        const index = current.findIndex(template => template.id === selectedId());
        const target = index + direction;
        if (index < 0 || target < 0 || target >= current.length) return;
        const next = [...current];
        [next[index], next[target]] = [next[target], next[index]];
        persist(next);
    };

    return (
        <div class="config__tab-container" data-name="quick-input" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'grid', 'grid-template-columns': '260px 1fr', gap: '16px', height: '100%' }}>
                <aside style={{ border: '1px solid var(--b3-border-color)', padding: '8px', 'border-radius': '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
                        <ButtonInput label="新增" onClick={addTemplate} />
                        <ButtonInput label="上移" classOutlined={true} onClick={() => moveSelected(-1)} />
                        <ButtonInput label="下移" classOutlined={true} onClick={() => moveSelected(1)} />
                    </div>
                    <For each={templates()} fallback={<div style={{ color: 'var(--b3-theme-on-surface-light)', padding: '16px 0' }}>暂无模板</div>}>
                        {(template) => (
                            <div
                                class="b3-list-item"
                                classList={{ 'b3-list-item--focus': selectedId() === template.id }}
                                style={{ cursor: 'pointer' }}
                                onClick={() => setSelectedId(template.id)}
                            >
                                <span class="b3-list-item__text">{template.icon ? `${template.icon} ` : ''}{template.name}</span>
                            </div>
                        )}
                    </For>
                </aside>
                <main style={{ overflow: 'auto', 'padding-right': '8px' }}>
                    <Show when={selectedTemplate()} keyed fallback={
                        <div style={{ color: 'var(--b3-theme-on-surface-light)', 'text-align': 'center', padding: '48px 0' }}>
                            选择或新增一个 QuickInput 模板。
                        </div>
                    }>
                        {(template) => (
                            <>
                                <div style={{ display: 'flex', 'justify-content': 'flex-end', 'margin-bottom': '8px' }}>
                                    <ButtonInput label="删除当前模板" classOutlined={true} onClick={removeTemplate} />
                                </div>
                                <TemplateEditor
                                    template={template}
                                    onPatch={patchSelected}
                                    onReplaceInsertTo={replaceInsertTo}
                                    onReplaceFields={replaceFields}
                                />
                            </>
                        )}
                    </Show>
                </main>
            </div>
        </div>
    );
}
