import { createSignal } from "solid-js";
import type { JSX } from "solid-js";

export default function FileUpload(props: {
    value?: File | null;
    changed?: (file: File | null) => void;
    style?: JSX.CSSProperties;
    accept?: string;
    placeholder?: string;
}) {
    const [fileName, setFileName] = createSignal<string>(
        props.value?.name || props.placeholder || '选择文件'
    );

    const handleChange = (e: Event) => {
        const target = e.currentTarget as HTMLInputElement;
        const file = target.files?.[0] || null;

        if (file) {
            setFileName(file.name);
            props.changed?.(file);
        } else {
            setFileName(props.placeholder || '选择文件');
            props.changed?.(null);
        }
    };

    return (
        <div style={{
            display: 'flex',
            'align-items': 'center',
            gap: '8px',
            ...props.style
        }}>
            <input
                type="file"
                accept={props.accept}
                onChange={handleChange}
                style={{ display: 'none' }}
                id={`file-upload-${Math.random().toString(36).substr(2, 9)}`}
            />
            <label
                for={`file-upload-${Math.random().toString(36).substr(2, 9)}`}
                class="b3-button b3-button--outline"
                style={{
                    cursor: 'pointer',
                    'white-space': 'nowrap'
                }}
            >
                浏览
            </label>
            <span style={{
                flex: '1',
                color: fileName() === (props.placeholder || '选择文件')
                    ? 'var(--b3-theme-on-surface-light)'
                    : 'var(--b3-theme-on-surface)',
                'font-size': '14px',
                overflow: 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap'
            }}>
                {fileName()}
            </span>
        </div>
    );
}

