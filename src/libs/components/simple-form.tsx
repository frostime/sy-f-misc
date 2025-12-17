import { createSignal, For, JSX } from "solid-js";
import {
    TextInput, TextArea, NumberInput, CheckboxInput,
    SelectInput, ButtonInput, SliderInput
} from "@/libs/components/Elements";
import RadioInput from "./Elements/RadioInput";
import FileUpload from "./Elements/FileUpload";

// 表单字段定义
export interface SimpleFormField {
    key: string;
    label?: string;
    type: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'slider' | 'radio' | 'upload';
    value: any;
    placeholder?: string;
    options?: Record<string, string>;  // 用于 select, radio
    min?: number;  // 用于 number, slider
    max?: number;  // 用于 number, slider
    step?: number;  // 用于 number, slider
    accept?: string;  // 用于 upload
    description?: string;  // 字段描述（可选）
}

export interface SimpleFormProps {
    fields: SimpleFormField[];
    onChange?: (key: string, value: any, current: Record<string, any>) => void;
    onSave?: (values: Record<string, any>) => void;
    onCancel?: () => void;
    labelWidth?: string;  // 标签列宽度
    styles?: JSX.CSSProperties;
    inputStyles?: JSX.CSSProperties;
}

export default function SimpleForm(props: SimpleFormProps) {
    // 初始化表单值
    const initialValues: Record<string, any> = {};
    props.fields.forEach(field => {
        initialValues[field.key] = field.value;
    });

    const [formValues, setFormValues] = createSignal(initialValues);

    // 更新单个字段值
    const updateField = (key: string, value: any) => {
        setFormValues(prev => ({
            ...prev,
            [key]: value
        }));
        props.onChange?.(key, value, { ...formValues(), [key]: value });
    };

    // 保存
    const handleSave = () => {
        props.onSave?.(formValues());
    };

    // 取消
    const handleCancel = () => {
        setFormValues(initialValues);
        props.onCancel?.();
    };

    // 判断字段是否为多行布局（需要标签顶对齐）
    const isMultilineField = (type: string) => {
        return type === 'textarea' || type === 'radio';
    };

    const inputStyles = {
        'width': '100%',
        ...props.inputStyles
    }

    // 渲染输入控件
    const renderInput = (field: SimpleFormField) => {
        const value = formValues()[field.key];

        switch (field.type) {
            case 'text':
                return (
                    <TextInput
                        value={value}
                        placeholder={field.placeholder}
                        onChanged={(v) => updateField(field.key, v)}
                        style={inputStyles}
                    />
                );
            case 'textarea':
                return (
                    <TextArea
                        value={value}
                        onChanged={(v) => updateField(field.key, v)}
                        style={inputStyles}
                    />
                );
            case 'number':
                return (
                    <NumberInput
                        value={value}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        changed={(v) => updateField(field.key, v)}
                        style={inputStyles}
                    />
                );
            case 'checkbox':
                return (
                    <CheckboxInput
                        checked={value}
                        changed={(v) => updateField(field.key, v)}
                        style={inputStyles}
                    />
                );
            case 'select':
                return (
                    <SelectInput
                        value={value}
                        options={field.options || {}}
                        changed={(v) => updateField(field.key, v)}
                        style={inputStyles}
                    />
                );
            case 'slider':
                return (
                    <div style={{
                        display: 'flex',
                        'align-items': 'center',
                        gap: '12px'
                    }}>
                        <SliderInput
                            value={value}
                            min={field.min ?? 0}
                            max={field.max ?? 100}
                            step={field.step ?? 1}
                            tooltip={true}
                            changed={(v) => updateField(field.key, v)}
                            style={{ flex: '1', ...inputStyles }}
                        />
                        <span style={{
                            'min-width': '40px',
                            'text-align': 'right',
                            color: 'var(--b3-theme-on-surface)',
                            'font-size': '14px'
                        }}>
                            {value}
                        </span>
                    </div>
                );
            case 'radio':
                return (
                    <RadioInput
                        value={value}
                        options={field.options || {}}
                        changed={(v) => updateField(field.key, v)}
                        style={inputStyles}
                    />
                );
            case 'upload':
                return (
                    <FileUpload
                        value={value}
                        accept={field.accept}
                        placeholder={field.placeholder}
                        changed={(v) => updateField(field.key, v)}
                        style={inputStyles}
                    />
                );
            default:
                return null;
        }
    };

    const labelWidth = props.labelWidth || '120px';

    return (
        <div style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '12px',
            ...props.styles
        }}>
            {/* 表单字段 */}
            <For each={props.fields}>
                {(field) => (
                    <div style={{
                        display: 'flex',
                        'align-items': isMultilineField(field.type) ? 'flex-start' : 'center',
                        gap: '12px',
                        'min-height': field.type === 'checkbox' ? 'auto' : '32px'
                    }}>
                        <label style={{
                            width: labelWidth,
                            'flex-shrink': '0',
                            'text-align': 'right',
                            'padding-top': isMultilineField(field.type) ? '8px' : '0',
                            'line-height': field.type === 'checkbox' ? '20px' : 'normal',
                            color: 'var(--b3-theme-on-surface)'
                        }}>
                            {field.label ?? field.key}:
                        </label>
                        <div style={{
                            flex: '1',
                            display: 'flex',
                            'flex-direction': 'column',
                            gap: '4px'
                        }}>
                            {renderInput(field)}
                            {field.description && (
                                <div style={{
                                    'font-size': '12px',
                                    color: 'var(--b3-theme-on-surface-light)',
                                    'line-height': '1.4'
                                }}>
                                    {field.description}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </For>

            {/* 操作按钮 */}
            {(props.onSave || props.onCancel) && (
                <div style={{
                    display: 'flex',
                    'justify-content': 'flex-end',
                    gap: '8px',
                    'margin-top': '8px',
                    'padding-left': `calc(${labelWidth} + 12px)`
                }}>
                    {props.onCancel && (
                        <ButtonInput
                            label="取消"
                            classOutlined={true}
                            onClick={handleCancel}
                        />
                    )}
                    {props.onSave && (
                        <ButtonInput
                            label="保存"
                            onClick={handleSave}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
