/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-01 00:00:00
 * @FilePath     : /src/func/gpt/setting/BatchPermissionConfigDialog.tsx
 * @Description  : 工具权限配置对话框 - 包含单工具和批量配置
 */
import { Component, createSignal, For, Show } from 'solid-js';
import { confirm } from 'siyuan';
import { Tool } from '../tools/types';
import { toolsManager } from './store';

// ==================== 共享常量 ====================

/** 危险工具列表 - 这些工具执行可能带来安全风险 */
export const DANGEROUS_TOOLS = ['Shell', 'Python', 'JavaScript', 'insertBlock', 'updateBlock', 'deleteBlock'];

/** 权限级别类型 */
export type PermissionLevel = 'public' | 'moderate' | 'sensitive';

// ==================== 共享工具函数 ====================

/**
 * 从工具定义中提取权限级别字符串
 * @param tool 工具对象
 * @returns 权限级别字符串
 */
export const getToolPermissionLevel = (tool: Tool): PermissionLevel => {
    const toolDef = tool.definition;
    if (toolDef.permissionLevel === 'moderate') return 'moderate';
    if (toolDef.permissionLevel === 'sensitive') return 'sensitive';
    return 'public';
};

/**
 * 获取工具的默认配置（来自工具定义 - 黄金标准）
 * @param tool 工具对象
 */
export const getToolDefaultConfig = (tool: Tool) => {
    const toolDef = tool.definition;
    return {
        permissionLevel: getToolPermissionLevel(tool),
        requireExecutionApproval: toolDef.requireExecutionApproval ?? true,
        requireResultApproval: toolDef.requireResultApproval ?? false
    };
};

/**
 * 获取工具的当前有效配置（用户覆盖 + 默认值）
 * @param tool 工具对象
 */
export const getToolEffectiveConfig = (tool: Tool) => {
    const toolName = tool.definition.function.name;
    const override = toolsManager().toolPermissionOverrides[toolName];
    const defaults = getToolDefaultConfig(tool);

    return {
        permissionLevel: (override?.permissionLevel || defaults.permissionLevel) as PermissionLevel,
        requireExecutionApproval: override?.requireExecutionApproval ?? defaults.requireExecutionApproval,
        requireResultApproval: override?.requireResultApproval ?? defaults.requireResultApproval
    };
};

// ==================== 单工具权限配置对话框 ====================

interface ToolPermissionConfigDialogProps {
    tool: Tool;
    onClose: () => void;
}

export const ToolPermissionConfigDialog: Component<ToolPermissionConfigDialogProps> = (props) => {
    const toolName = props.tool.definition.function.name;
    const toolDescription = props.tool.definition.function.description || '';

    // 获取当前配置和默认配置
    const effectiveConfig = getToolEffectiveConfig(props.tool);
    const defaultConfig = getToolDefaultConfig(props.tool);

    const [permissionLevel, setPermissionLevel] = createSignal<PermissionLevel>(effectiveConfig.permissionLevel);
    const [requireExecutionApproval, setRequireExecutionApproval] = createSignal(effectiveConfig.requireExecutionApproval);
    const [requireResultApproval, setRequireResultApproval] = createSignal(effectiveConfig.requireResultApproval);

    const isDangerousConfig = () => {
        return DANGEROUS_TOOLS.includes(toolName) && permissionLevel() === 'public';
    };

    const hasModifications = () => {
        return permissionLevel() !== effectiveConfig.permissionLevel ||
            requireExecutionApproval() !== effectiveConfig.requireExecutionApproval ||
            requireResultApproval() !== effectiveConfig.requireResultApproval;
    };

    const handleSave = async () => {
        // 检查危险配置
        if (isDangerousConfig()) {
            const confirmed = await new Promise<boolean>((resolve) => {
                confirm(
                    '⚠️ 危险配置警告',
                    `您正在将 "${toolName}" 设置为"无需审核"。\n\n这是一个敏感工具，跳过审核可能带来安全风险。\n\n确定要继续吗？`,
                    () => resolve(true)
                );
                setTimeout(() => resolve(false), 100);
            });

            if (!confirmed) return;
        }

        // 保存配置
        toolsManager.update('toolPermissionOverrides', toolName, {
            permissionLevel: permissionLevel(),
            requireExecutionApproval: requireExecutionApproval(),
            requireResultApproval: requireResultApproval()
        });

        props.onClose();
    };

    const handleReset = () => {
        // 恢复到工具硬编码的默认值（黄金标准）
        const defaults = getToolDefaultConfig(props.tool);
        setPermissionLevel(defaults.permissionLevel);
        setRequireExecutionApproval(defaults.requireExecutionApproval);
        setRequireResultApproval(defaults.requireResultApproval);

        // 从 store 中移除用户覆盖配置
        const currentOverrides = toolsManager().toolPermissionOverrides;
        if (currentOverrides[toolName]) {
            const newOverrides = { ...currentOverrides };
            delete newOverrides[toolName];
            toolsManager({
                ...toolsManager(),
                toolPermissionOverrides: newOverrides
            });
        }
    };

    return (
        <div style={{
            padding: '16px',
            width: '500px',
            'max-height': '80vh',
            overflow: 'auto'
        }}>
            <div class="b3-typography">
                <h3>{toolName}</h3>
                <p style={{ color: 'var(--b3-theme-on-surface-light)', 'font-size': '13px' }}>
                    {toolDescription}
                </p>

                {/* 权限级别选择 */}
                <div style={{ 'margin-top': '20px' }}>
                    <h4>权限级别</h4>
                    <div style={{ 'margin-left': '8px' }}>
                        <label style={{ display: 'block', 'margin-bottom': '8px', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="permissionLevel"
                                checked={permissionLevel() === 'public'}
                                onChange={() => setPermissionLevel('public')}
                            />
                            <span style={{ 'margin-left': '8px' }}>
                                公开 (无需审核)
                                <Show when={defaultConfig.permissionLevel === 'public'}>
                                    <span style={{ color: 'var(--b3-theme-on-surface-light)', 'font-size': '12px' }}> [默认]</span>
                                </Show>
                            </span>
                        </label>

                        <label style={{ display: 'block', 'margin-bottom': '8px', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="permissionLevel"
                                checked={permissionLevel() === 'moderate'}
                                onChange={() => setPermissionLevel('moderate')}
                            />
                            <span style={{ 'margin-left': '8px' }}>
                                中等 (首次审核，记住选择)
                                <Show when={defaultConfig.permissionLevel === 'moderate'}>
                                    <span style={{ color: 'var(--b3-theme-on-surface-light)', 'font-size': '12px' }}> [默认]</span>
                                </Show>
                            </span>
                        </label>

                        <label style={{ display: 'block', 'margin-bottom': '8px', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="permissionLevel"
                                checked={permissionLevel() === 'sensitive'}
                                onChange={() => setPermissionLevel('sensitive')}
                            />
                            <span style={{ 'margin-left': '8px' }}>
                                敏感 (每次审核)
                                <Show when={defaultConfig.permissionLevel === 'sensitive'}>
                                    <span style={{ color: 'var(--b3-theme-on-surface-light)', 'font-size': '12px' }}> [默认]</span>
                                </Show>
                            </span>
                        </label>
                    </div>
                </div>

                {/* 审核选项 */}
                <div style={{ 'margin-top': '20px' }}>
                    <h4>审核选项</h4>
                    <div style={{ 'margin-left': '8px' }}>
                        <label style={{ display: 'block', 'margin-bottom': '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={requireExecutionApproval()}
                                onChange={(e) => setRequireExecutionApproval(e.currentTarget.checked)}
                            />
                            <span style={{ 'margin-left': '8px' }}>
                                执行前需要审核
                                <Show when={defaultConfig.requireExecutionApproval === true}>
                                    <span style={{ color: 'var(--b3-theme-on-surface-light)', 'font-size': '12px' }}> [默认开启]</span>
                                </Show>
                            </span>
                        </label>

                        <label style={{ display: 'block', 'margin-bottom': '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={requireResultApproval()}
                                onChange={(e) => setRequireResultApproval(e.currentTarget.checked)}
                            />
                            <span style={{ 'margin-left': '8px' }}>
                                执行后需要审核结果
                                <Show when={defaultConfig.requireResultApproval === true}>
                                    <span style={{ color: 'var(--b3-theme-on-surface-light)', 'font-size': '12px' }}> [默认开启]</span>
                                </Show>
                            </span>
                        </label>
                    </div>
                </div>

                {/* 危险配置警告 */}
                <Show when={isDangerousConfig()}>
                    <div style={{
                        'margin-top': '16px',
                        padding: '12px',
                        background: 'var(--b3-theme-error-lighter)',
                        border: '1px solid var(--b3-card-error-color)',
                        'border-radius': '4px',
                        color: 'var(--b3-card-error-color)',
                        'font-size': '13px'
                    }}>
                        <strong>⚠️ 警告：</strong> 该工具被标记为敏感工具，设置为"无需审核"可能存在安全风险。
                    </div>
                </Show>
            </div>

            {/* 按钮区域 */}
            <div style={{
                display: 'flex',
                'justify-content': 'space-between',
                'margin-top': '24px',
                gap: '8px'
            }}>
                <button
                    class="b3-button b3-button--outline"
                    onClick={handleReset}
                >
                    恢复默认
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        class="b3-button b3-button--cancel"
                        onClick={props.onClose}
                    >
                        取消
                    </button>
                    <button
                        class="b3-button b3-button--text"
                        onClick={handleSave}
                        disabled={!hasModifications()}
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==================== 批量工具权限配置对话框 ====================

interface BatchPermissionConfigDialogProps {
    tools: Tool[];
    groupName?: string;  // 如果提供，表示是工具组级别的批量配置
    onClose: () => void;
}

export const BatchPermissionConfigDialog: Component<BatchPermissionConfigDialogProps> = (props) => {
    const [permissionLevel, setPermissionLevel] = createSignal<PermissionLevel>('moderate');
    const [requireExecutionApproval, setRequireExecutionApproval] = createSignal(true);
    const [requireResultApproval, setRequireResultApproval] = createSignal(true);

    // 配置选项
    const [applyPermissionLevel, setApplyPermissionLevel] = createSignal(false);
    const [applyExecutionApproval, setApplyExecutionApproval] = createSignal(false);
    const [applyResultApproval, setApplyResultApproval] = createSignal(false);

    // 工具选择（默认全选）
    const [selectedTools, setSelectedTools] = createSignal<Set<string>>(
        new Set(props.tools.map(t => t.definition.function.name))
    );

    const toggleToolSelection = (toolName: string) => {
        const newSet = new Set(selectedTools());
        if (newSet.has(toolName)) {
            newSet.delete(toolName);
        } else {
            newSet.add(toolName);
        }
        setSelectedTools(newSet);
    };

    const selectAll = () => {
        setSelectedTools(new Set(props.tools.map(t => t.definition.function.name)));
    };

    const selectNone = () => {
        setSelectedTools(new Set<string>());
    };

    const hasDangerousConfig = () => {
        if (!applyPermissionLevel() || permissionLevel() !== 'public') return false;

        return Array.from(selectedTools()).some(toolName => DANGEROUS_TOOLS.includes(toolName));
    };

    const getDangerousToolNames = () => {
        return Array.from(selectedTools()).filter(toolName => DANGEROUS_TOOLS.includes(toolName));
    };

    const handleApply = async () => {
        if (selectedTools().size === 0) {
            confirm('提示', '请至少选择一个工具', () => { });
            return;
        }

        // 检查危险配置
        if (hasDangerousConfig()) {
            const dangerousNames = getDangerousToolNames().join(', ');
            const confirmed = await new Promise<boolean>((resolve) => {
                confirm(
                    '⚠️ 危险配置警告',
                    `您正在将以下敏感工具设置为"无需审核"：\n${dangerousNames}\n\n这可能带来安全风险。确定要继续吗？`,
                    () => resolve(true)
                );
                setTimeout(() => resolve(false), 100);
            });

            if (!confirmed) return;
        }

        // 应用配置到选中的工具
        const currentOverrides = toolsManager().toolPermissionOverrides;
        const newOverrides = { ...currentOverrides };

        selectedTools().forEach(toolName => {
            const existingConfig = newOverrides[toolName] || {};

            newOverrides[toolName] = {
                permissionLevel: applyPermissionLevel() ? permissionLevel() : existingConfig.permissionLevel,
                requireExecutionApproval: applyExecutionApproval()
                    ? requireExecutionApproval()
                    : existingConfig.requireExecutionApproval,
                requireResultApproval: applyResultApproval()
                    ? requireResultApproval()
                    : existingConfig.requireResultApproval
            };
        });

        toolsManager({
            ...toolsManager(),
            toolPermissionOverrides: newOverrides
        });

        props.onClose();
    };

    const handleReset = async () => {
        if (selectedTools().size === 0) {
            confirm('提示', '请至少选择一个工具', () => { });
            return;
        }

        const confirmed = await new Promise<boolean>((resolve) => {
            confirm(
                '确认恢复默认',
                `将为 ${selectedTools().size} 个工具恢复默认权限配置，确定继续吗？`,
                () => resolve(true)
            );
            setTimeout(() => resolve(false), 100);
        });

        if (!confirmed) return;

        // 删除选中工具的覆盖配置
        const currentOverrides = toolsManager().toolPermissionOverrides;
        const newOverrides = { ...currentOverrides };

        selectedTools().forEach(toolName => {
            delete newOverrides[toolName];
        });

        toolsManager({
            ...toolsManager(),
            toolPermissionOverrides: newOverrides
        });

        props.onClose();
    };

    return (
        <div style={{
            padding: '16px',
            width: '700px',
            'max-height': '85vh',
            overflow: 'auto'
        }}>
            <div class="b3-typography">
                <h3>
                    批量配置工具权限
                    <Show when={props.groupName}>
                        <span style={{ 'font-size': '14px', color: 'var(--b3-theme-on-surface-light)' }}>
                            {' '}· {props.groupName}
                        </span>
                    </Show>
                </h3>

                {/* 工具选择区域 */}
                <div style={{ 'margin-top': '16px' }}>
                    <div style={{
                        display: 'flex',
                        'justify-content': 'space-between',
                        'align-items': 'center',
                        'margin-bottom': '8px'
                    }}>
                        <h4 style={{ margin: 0 }}>选择工具 ({selectedTools().size}/{props.tools.length})</h4>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                class="b3-button b3-button--text"
                                style={{ 'font-size': '12px', padding: '2px 8px' }}
                                onClick={selectAll}
                            >
                                全选
                            </button>
                            <button
                                class="b3-button b3-button--text"
                                style={{ 'font-size': '12px', padding: '2px 8px' }}
                                onClick={selectNone}
                            >
                                取消全选
                            </button>
                        </div>
                    </div>

                    <div style={{
                        'max-height': '200px',
                        overflow: 'auto',
                        border: '1px solid var(--b3-border-color)',
                        'border-radius': '4px',
                        padding: '8px'
                    }}>
                        <For each={props.tools}>
                            {tool => {
                                const toolName = tool.definition.function.name;
                                const isDangerous = DANGEROUS_TOOLS.includes(toolName);
                                return (
                                    <label style={{
                                        display: 'block',
                                        'margin-bottom': '6px',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        'border-radius': '3px',
                                        background: selectedTools().has(toolName)
                                            ? 'var(--b3-theme-primary-lighter)'
                                            : 'transparent'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedTools().has(toolName)}
                                            onChange={() => toggleToolSelection(toolName)}
                                        />
                                        <span style={{ 'margin-left': '8px', 'font-weight': '500' }}>
                                            {toolName}
                                            <Show when={isDangerous}>
                                                <span style={{
                                                    'margin-left': '6px',
                                                    color: 'var(--b3-card-error-color)',
                                                    'font-size': '11px'
                                                }}>
                                                    [敏感]
                                                </span>
                                            </Show>
                                        </span>
                                        <span style={{
                                            'margin-left': '8px',
                                            color: 'var(--b3-theme-on-surface-light)',
                                            'font-size': '12px'
                                        }}>
                                            {tool.definition.function.description}
                                        </span>
                                    </label>
                                );
                            }}
                        </For>
                    </div>
                </div>

                {/* 配置选项 */}
                <div style={{ 'margin-top': '20px' }}>
                    <h4>配置选项</h4>

                    {/* 权限级别 */}
                    <div style={{ 'margin-bottom': '16px' }}>
                        <label style={{ display: 'flex', 'align-items': 'center', 'margin-bottom': '8px' }}>
                            <input
                                type="checkbox"
                                checked={applyPermissionLevel()}
                                onChange={(e) => setApplyPermissionLevel(e.currentTarget.checked)}
                            />
                            <span style={{ 'margin-left': '8px', 'font-weight': '500' }}>设置权限级别</span>
                        </label>

                        <Show when={applyPermissionLevel()}>
                            <div style={{ 'margin-left': '8px' }}>
                                <label style={{ display: 'block', 'margin-bottom': '6px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="batchPermissionLevel"
                                        checked={permissionLevel() === 'public'}
                                        onChange={() => setPermissionLevel('public')}
                                    />
                                    <span style={{ 'margin-left': '8px' }}>公开 (无需审核)</span>
                                </label>
                                <label style={{ display: 'block', 'margin-bottom': '6px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="batchPermissionLevel"
                                        checked={permissionLevel() === 'moderate'}
                                        onChange={() => setPermissionLevel('moderate')}
                                    />
                                    <span style={{ 'margin-left': '8px' }}>中等 (首次审核，记住选择)</span>
                                </label>
                                <label style={{ display: 'block', 'margin-bottom': '6px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="batchPermissionLevel"
                                        checked={permissionLevel() === 'sensitive'}
                                        onChange={() => setPermissionLevel('sensitive')}
                                    />
                                    <span style={{ 'margin-left': '8px' }}>敏感 (每次审核)</span>
                                </label>
                            </div>
                        </Show>
                    </div>

                    {/* 执行前审核 */}
                    <div style={{ 'margin-bottom': '12px' }}>
                        <label style={{ display: 'flex', 'align-items': 'center', 'margin-bottom': '6px' }}>
                            <input
                                type="checkbox"
                                checked={applyExecutionApproval()}
                                onChange={(e) => setApplyExecutionApproval(e.currentTarget.checked)}
                            />
                            <span style={{ 'margin-left': '8px', 'font-weight': '500' }}>设置执行前审核</span>
                        </label>

                        <Show when={applyExecutionApproval()}>
                            <label style={{ display: 'flex', 'align-items': 'center', 'margin-left': '24px' }}>
                                <input
                                    type="checkbox"
                                    checked={requireExecutionApproval()}
                                    onChange={(e) => setRequireExecutionApproval(e.currentTarget.checked)}
                                />
                                <span style={{ 'margin-left': '8px' }}>执行前需要审核</span>
                            </label>
                        </Show>
                    </div>

                    {/* 执行后审核 */}
                    <div style={{ 'margin-bottom': '12px' }}>
                        <label style={{ display: 'flex', 'align-items': 'center', 'margin-bottom': '6px' }}>
                            <input
                                type="checkbox"
                                checked={applyResultApproval()}
                                onChange={(e) => setApplyResultApproval(e.currentTarget.checked)}
                            />
                            <span style={{ 'margin-left': '8px', 'font-weight': '500' }}>设置执行后审核</span>
                        </label>

                        <Show when={applyResultApproval()}>
                            <label style={{ display: 'flex', 'align-items': 'center', 'margin-left': '24px' }}>
                                <input
                                    type="checkbox"
                                    checked={requireResultApproval()}
                                    onChange={(e) => setRequireResultApproval(e.currentTarget.checked)}
                                />
                                <span style={{ 'margin-left': '8px' }}>执行后需要审核结果</span>
                            </label>
                        </Show>
                    </div>
                </div>

                {/* 危险配置警告 */}
                <Show when={hasDangerousConfig()}>
                    <div style={{
                        'margin-top': '16px',
                        padding: '12px',
                        background: 'var(--b3-theme-error-lighter)',
                        border: '1px solid var(--b3-card-error-color)',
                        'border-radius': '4px',
                        color: 'var(--b3-card-error-color)',
                        'font-size': '13px'
                    }}>
                        <strong>⚠️ 警告：</strong> 您选择的工具中包含敏感工具（{getDangerousToolNames().join(', ')}），设置为"无需审核"可能存在安全风险。
                    </div>
                </Show>
            </div>

            {/* 按钮区域 */}
            <div style={{
                display: 'flex',
                'justify-content': 'space-between',
                'margin-top': '24px',
                gap: '8px'
            }}>
                <button
                    class="b3-button b3-button--outline"
                    onClick={handleReset}
                >
                    批量恢复默认
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        class="b3-button b3-button--cancel"
                        onClick={props.onClose}
                    >
                        取消
                    </button>
                    <button
                        class="b3-button b3-button--text"
                        onClick={handleApply}
                    >
                        应用配置
                    </button>
                </div>
            </div>
        </div>
    );
};
