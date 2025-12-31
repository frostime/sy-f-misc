/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-12-31
 * @FilePath     : /src/func/gpt/setting/PrivacyFieldsSetting.tsx
 * @Description  : Privacy fields configuration component
 */

import { Component, For, createSignal } from 'solid-js';
import { IPrivacyField, PRIVACY_PRESETS } from '../privacy';
import { confirmDialog } from '@frostime/siyuan-plugin-kits';

interface PrivacyFieldsSettingProps {
    fields: IPrivacyField[];
    onSave: (fields: IPrivacyField[]) => void;
    onClose: () => void;
}

export const PrivacyFieldsSetting: Component<PrivacyFieldsSettingProps> = (props) => {
    const [fields, setFields] = createSignal<IPrivacyField[]>(props.fields);

    const addField = () => {
        const newField: IPrivacyField = {
            patterns: [],
            isRegex: false,
            maskType: 'custom',
            enabled: true,
            description: ''
        };
        setFields([...fields(), newField]);
    };

    const addPreset = (preset: IPrivacyField) => {
        const exists = fields().some(f =>
            f.maskType === preset.maskType &&
            JSON.stringify(f.patterns) === JSON.stringify(preset.patterns)
        );
        if (exists) {
            confirmDialog({
                title: '提示',
                content: '该预设规则已存在',
            });
            return;
        }
        setFields([...fields(), { ...preset }]);
    };

    const removeField = (index: number) => {
        setFields(fields().filter((_, i) => i !== index));
    };

    const updateField = (index: number, updates: Partial<IPrivacyField>) => {
        const newFields = [...fields()];
        newFields[index] = { ...newFields[index], ...updates };
        setFields(newFields);
    };

    const updatePatterns = (index: number, value: string) => {
        const patterns = value.split('\n').map(p => p.trim()).filter(p => p.length > 0);
        updateField(index, { patterns });
    };

    const handleSave = () => {
        props.onSave(fields());
    };

    return (
        <div class="" style="width: 100%; box-sizing: border-box;">
            <div style={{ padding: '16px' }}>
                <div style={{
                    'margin-bottom': '16px',
                    display: 'flex',
                    gap: '8px',
                    'align-items': 'center'
                }}>
                    <button
                        class="b3-button b3-button--outline"
                        onclick={addField}
                    >
                        添加自定义字段
                    </button>
                    <div style={{ 'margin-left': '16px' }}>
                        <span style={{ 'margin-right': '8px' }}>快速添加预设：</span>
                        <For each={PRIVACY_PRESETS}>
                            {(preset) => (
                                <button
                                    class="b3-button b3-button--text"
                                    onclick={() => addPreset(preset)}
                                    style={{ 'margin-right': '4px' }}
                                >
                                    {preset.description}
                                </button>
                            )}
                        </For>
                    </div>
                </div>

                <div style={{
                    border: '1px solid var(--b3-theme-surface-lighter)',
                    'border-radius': '4px',
                    padding: '8px'
                }}>
                    <For each={fields()}>
                        {(field, index) => (
                            <div style={{
                                padding: '12px',
                                'margin-bottom': '8px',
                                border: '1px solid var(--b3-theme-surface-light)',
                                'border-radius': '4px',
                                background: 'var(--b3-theme-background)'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    'align-items': 'center',
                                    gap: '8px',
                                    'margin-bottom': '8px'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={field.enabled}
                                        onchange={(e) => updateField(index(), { enabled: e.target.checked })}
                                    />
                                    <select
                                        value={field.maskType}
                                        onchange={(e) => updateField(index(), { maskType: e.target.value as any })}
                                        style={{ padding: '4px 8px' }}
                                    >
                                        <option value="email">邮箱</option>
                                        <option value="phone">电话</option>
                                        <option value="bankcard">银行卡</option>
                                        <option value="api_key">API密钥</option>
                                        <option value="password">密码</option>
                                        <option value="id_card">身份证</option>
                                        <option value="address">地址</option>
                                        <option value="name">姓名</option>
                                        <option value="custom">自定义</option>
                                    </select>
                                    <label style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
                                        <input
                                            type="checkbox"
                                            checked={field.isRegex}
                                            onchange={(e) => updateField(index(), { isRegex: e.target.checked })}
                                        />
                                        正则表达式
                                    </label>
                                    <button
                                        class="b3-button b3-button--cancel"
                                        onclick={() => removeField(index())}
                                        style={{ 'margin-left': 'auto' }}
                                    >
                                        删除
                                    </button>
                                </div>
                                <div style={{ 'margin-bottom': '8px' }}>
                                    <textarea
                                        class="b3-text-field"
                                        rows={3}
                                        value={(field.patterns || []).join('\n')}
                                        placeholder={field.isRegex ? "每行一个正则表达式\n例如：\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b" : "每行一个关键词\n例如：张三\n李四"}
                                        oninput={(e) => updatePatterns(index(), e.target.value)}
                                        style={{ width: '100%', 'font-size': '12px' }}
                                    />
                                </div>
                                <div>
                                    <input
                                        type="text"
                                        class="b3-text-field"
                                        value={field.description || ''}
                                        placeholder="描述（可选）"
                                        oninput={(e) => updateField(index(), { description: e.target.value })}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            </div>
                        )}
                    </For>
                    {fields().length === 0 && (
                        <div style={{
                            padding: '24px',
                            'text-align': 'center',
                            color: 'var(--b3-theme-on-surface-light)'
                        }}>
                            暂无隐私字段配置，点击上方按钮添加
                        </div>
                    )}
                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel" onclick={props.onClose}>
                    取消
                </button>
                <button class="b3-button b3-button--text" onclick={handleSave}>
                    保存
                </button>
            </div>
        </div>
    );
};
export default PrivacyFieldsSetting;