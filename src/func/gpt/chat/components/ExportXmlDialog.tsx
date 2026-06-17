import { Component, JSX, createSignal } from 'solid-js';

import ButtonInput from '@/libs/components/Elements/ButtonInput';
import type { ChatXmlExportOptions, XmlExportMode, XmlVersionMode } from '@gpt/persistence';

const containerStyle: JSX.CSSProperties = {
    display: 'flex',
    'flex-direction': 'column',
    gap: '10px',
    padding: '16px 20px 12px',
};

const optionRowStyle: JSX.CSSProperties = {
    display: 'grid',
    'grid-template-columns': '1fr auto',
    'align-items': 'center',
    gap: '16px',
    padding: '10px 0',
};

const optionTitleStyle: JSX.CSSProperties = {
    color: 'var(--b3-theme-on-background)',
    'font-size': '14px',
    'font-weight': 500,
    'line-height': '22px',
};

const optionDescriptionStyle: JSX.CSSProperties = {
    color: 'var(--b3-theme-on-surface-light)',
    'font-size': '12px',
    'line-height': '18px',
    'margin-top': '2px',
};

const actionBarStyle: JSX.CSSProperties = {
    display: 'flex',
    'justify-content': 'flex-end',
    gap: '8px',
    'border-top': '1px solid var(--b3-theme-surface-lighter)',
    'padding-top': '12px',
    'margin-top': '4px',
};

const OptionRow: Component<{
    title: string;
    description: string;
    control: JSX.Element;
}> = (props) => (
    <div style={optionRowStyle}>
        <div>
            <div style={optionTitleStyle}>{props.title}</div>
            <div style={optionDescriptionStyle}>{props.description}</div>
        </div>
        <div>{props.control}</div>
    </div>
);

export const ExportXmlDialog: Component<{
    defaultSkipHidden: boolean;
    onExport: (options: ChatXmlExportOptions) => void;
    onCancel: () => void;
}> = (props) => {
    const [versionMode, setVersionMode] = createSignal<XmlVersionMode>('current');
    const [exportMode, setExportMode] = createSignal<XmlExportMode>('reading');
    const [skipHidden, setSkipHidden] = createSignal(props.defaultSkipHidden);
    const [includeReasoning, setIncludeReasoning] = createSignal(false);

    const exportXml = () => {
        props.onExport({
            versionMode: versionMode(),
            exportMode: exportMode(),
            skipHidden: skipHidden(),
            includeReasoning: includeReasoning(),
        });
    };

    return (
        <div style={containerStyle}>
            <OptionRow
                title="导出偏好"
                description="阅读：仅保留 role 和内容，适合阅读。程序：保留完整元信息，适合程序处理。"
                control={
                    <select
                        class="b3-select"
                        style={{ width: '180px' }}
                        value={exportMode()}
                        onChange={(e) => setExportMode(e.currentTarget.value as XmlExportMode)}
                    >
                        <option value="reading">阅读</option>
                        <option value="programming">程序</option>
                    </select>
                }
            />

            <OptionRow
                title="版本范围"
                description="所有版本会在同一个消息节点内嵌套 Version，不拆成多个 Role。"
                control={
                    <select
                        class="b3-select"
                        style={{ width: '180px' }}
                        value={versionMode()}
                        onChange={(e) => setVersionMode(e.currentTarget.value as XmlVersionMode)}
                    >
                        <option value="current">当前版本</option>
                        <option value="all">所有版本</option>
                    </select>
                }
            />

            <OptionRow
                title="跳过隐藏消息"
                description="默认沿用当前 Markdown 导出设置。"
                control={
                    <input
                        class="b3-switch fn__flex-center"
                        type="checkbox"
                        checked={skipHidden()}
                        onChange={(e) => setSkipHidden(e.currentTarget.checked)}
                    />
                }
            />

            <OptionRow
                title="导出 reasoning"
                description="默认不导出 reasoning，避免泄露或增加噪音。"
                control={
                    <input
                        class="b3-switch fn__flex-center"
                        type="checkbox"
                        checked={includeReasoning()}
                        onChange={(e) => setIncludeReasoning(e.currentTarget.checked)}
                    />
                }
            />

            <div style={actionBarStyle}>
                <ButtonInput label="取消" classOutlined={true} onClick={props.onCancel} />
                <ButtonInput label="导出" onClick={exportXml} />
            </div>
        </div>
    );
};

export default ExportXmlDialog;
