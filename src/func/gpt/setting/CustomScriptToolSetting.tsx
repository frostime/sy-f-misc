/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-11-16 00:00:00
 * @FilePath     : /src/func/gpt/setting/CustomScriptToolSetting.tsx
 * @Description  : Custom script tools settings UI
 */

import { Component, For, Show, createSignal, onMount } from 'solid-js';
import { showMessage } from 'siyuan';
import {
    getCachedModules,
    parseAllScripts,
    reparseOutdatedScripts,
    openCustomScriptsDir,
    checkPythonAvailable
} from '../tools/custom-program-tools';
import type { ParsedToolModule } from '../tools/custom-program-tools/resolve-tools';

/**
 * 自定义脚本工具设置组件
 */
export const CustomScriptToolSetting: Component = () => {
    const [scripts, setScripts] = createSignal<ParsedToolModule[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [pythonInfo, setPythonInfo] = createSignal<{ available: boolean; version?: string; error?: string }>({ available: false });
    const [expandedModules, setExpandedModules] = createSignal<Record<string, boolean>>({});

    // 检查 Python 环境
    const checkPython = async () => {
        const info = await checkPythonAvailable();
        setPythonInfo(info);
    };

    // 从缓存加载脚本列表
    const loadScriptsFromCache = () => {
        const modules = getCachedModules();
        setScripts(modules);

        // 初始化展开状态
        const expanded: Record<string, boolean> = {};
        modules.forEach(m => {
            expanded[m.moduleData.name] = false;
        });
        setExpandedModules(expanded);
    };

    // 重新解析并导入
    const parseAndImport = async () => {
        setLoading(true);
        try {
            showMessage('正在解析脚本...', 3000, 'info');

            const result = await parseAllScripts(
                scripts().map(s => s.scriptPath)
            );

            if (result.success) {
                showMessage(`成功解析 ${result.successCount} 个脚本`, 3000, 'info');
                loadScriptsFromCache();

                // 提示需要重新加载工具
                showMessage('工具定义已更新，请通过上方「重新导入」按钮重新加载', 5000, 'info');
            } else {
                const errorMsg = result.errors.map(e => `${e.script}: ${e.error}`).join('\n');
                showMessage(`解析失败:\n${errorMsg}`, 5000, 'error');
            }
        } catch (error) {
            console.error('Failed to parse scripts:', error);
            showMessage('解析脚本失败: ' + error.message, 5000, 'error');
        } finally {
            setLoading(false);
        }
    };

    // 重新解析过时的脚本
    const reparseOutdated = async () => {
        setLoading(true);
        try {
            const result = await reparseOutdatedScripts();

            if (result.parsedCount === 0) {
                showMessage('所有脚本都是最新的', 2000, 'info');
            } else if (result.success) {
                showMessage(`重新解析了 ${result.parsedCount} 个脚本`, 3000, 'info');
                loadScriptsFromCache();
            } else {
                const errorMsg = result.errors.map(e => `${e.script}: ${e.error}`).join('\n');
                showMessage(`解析失败:\n${errorMsg}`, 5000, 'error');
            }
        } catch (error) {
            console.error('Failed to reparse scripts:', error);
            showMessage('重新解析失败: ' + error.message, 5000, 'error');
        } finally {
            setLoading(false);
        }
    };

    // 打开脚本目录
    const openScriptDir = async () => {
        await openCustomScriptsDir();
    };

    // 切换模块展开状态
    const toggleModule = (moduleName: string) => {
        setExpandedModules(prev => ({
            ...prev,
            [moduleName]: !prev[moduleName]
        }));
    };

    // 组件挂载时检查环境和加载脚本
    onMount(() => {
        checkPython();
        loadScriptsFromCache();
    });

    const CustomScriptModule = (module: ParsedToolModule) => (
        <div class="b3-card" style={{ margin: '0 0 8px 0', padding: '0' }}>
            {/* 模块头部 */}
            <div
                class="custom-script-module-header"
                style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    'justify-content': 'space-between',
                    'align-items': 'center',
                    'border-bottom': expandedModules()[module.moduleData.name] ? '1px solid var(--b3-border-color)' : 'none'
                }}
                onClick={() => toggleModule(module.moduleData.name)}
            >
                <div style={{ flex: 1 }}>
                    <div style={{ 'font-weight': 'bold', 'font-size': '15px', 'margin-bottom': '4px' }}>
                        {module.moduleData.name}
                    </div>
                    <div style={{ 'font-size': '12px', color: 'var(--b3-theme-on-surface-light)', display: 'flex', gap: '12px' }}>
                        <span>📄 {module.scriptName}</span>
                        <span>🛠️ {module.moduleData.tools.length} 个工具</span>
                    </div>
                </div>
                <svg
                    class="icon-arrow"
                    style={{
                        width: '16px',
                        height: '16px',
                        transform: expandedModules()[module.moduleData.name] ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                    }}
                >
                    <use href="#iconDown"></use>
                </svg>
            </div>

            {/* 模块详情 */}
            <Show when={expandedModules()[module.moduleData.name]}>
                <div style={{ padding: '12px 16px' }}>
                    {/* 模块说明 */}
                    <Show when={module.moduleData.rulePrompt}>
                        <div
                            style={{
                                'background-color': 'var(--b3-theme-surface)',
                                padding: '8px 12px',
                                'border-radius': '4px',
                                'margin-bottom': '12px',
                                'font-size': '13px',
                                'white-space': 'pre-wrap',
                                'font-family': 'var(--b3-font-family-code)'
                            }}
                        >
                            {module.moduleData.rulePrompt}
                        </div>
                    </Show>

                    {/* 工具列表 */}
                    <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>工具列表:</div>
                    <For each={module.moduleData.tools}>
                        {(tool) => (
                            <div
                                style={{
                                    padding: '8px 12px',
                                    'background-color': 'var(--b3-theme-surface)',
                                    'border-radius': '4px',
                                    'margin-bottom': '6px'
                                }}
                            >
                                <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ 'font-weight': 'bold', 'font-family': 'var(--b3-font-family-code)' }}>
                                            {tool.function.name}()
                                        </div>
                                        <Show when={tool.function.description}>
                                            <div style={{ 'font-size': '13px', color: 'var(--b3-theme-on-surface-light)', 'margin-top': '4px' }}>
                                                {tool.function.description}
                                            </div>
                                        </Show>
                                        <Show when={(tool as any).permissionLevel}>
                                            <div style={{ 'margin-top': '4px', 'font-size': '12px' }}>
                                                <span
                                                    style={{
                                                        padding: '2px 6px',
                                                        'border-radius': '3px',
                                                        'background-color':
                                                            (tool as any).permissionLevel === 'public' ? 'var(--b3-card-success-background)' :
                                                                (tool as any).permissionLevel === 'moderate' ? 'var(--b3-card-warning-background)' :
                                                                    'var(--b3-card-error-background)',
                                                        color:
                                                            (tool as any).permissionLevel === 'public' ? 'var(--b3-card-success-color)' :
                                                                (tool as any).permissionLevel === 'moderate' ? 'var(--b3-card-warning-color)' :
                                                                    'var(--b3-card-error-color)'
                                                    }}
                                                >
                                                    {(tool as any).permissionLevel}
                                                </span>
                                            </div>
                                        </Show>
                                    </div>
                                </div>
                            </div>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    )

    return (
        <div class="custom-script-tools-setting">
            {/* Python 环境状态 */}
            <div class="b3-card" style={{ margin: '0 0 8px 0', padding: '8px 16px' }}>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    <span style={{ 'font-weight': 'bold' }}>Python 环境:</span>
                    <Show
                        when={pythonInfo().available}
                        fallback={
                            <span style={{ color: 'var(--b3-theme-error)' }}>
                                ❌ Python 未安装或不可用
                            </span>
                        }
                    >
                        <span style={{ color: 'var(--b3-theme-on-surface)' }}>
                            ✅ {pythonInfo().version}
                        </span>
                    </Show>
                </div>
            </div>

            {/* 说明信息 */}
            <div class="b3-card" style={{ margin: '0 0 8px 0', padding: '8px 16px' }}>
                <div style={{ 'font-size': '14px', 'line-height': '1.6' }}>
                    <p style={{ margin: '0 0 8px 0' }}>
                        <strong>自定义脚本工具</strong>允许你通过 Python 脚本扩展 GPT 工具能力。
                    </p>
                    <ul style={{ margin: '0', 'padding-left': '20px' }}>
                        <li>将 Python 脚本（.py）放入脚本目录</li>
                        <li>点击「重新解析并导入」生成工具定义</li>
                        <li>脚本中的公开函数将作为工具暴露给 LLM</li>
                        <li>使用类型注解和文档字符串定义工具参数</li>
                    </ul>
                </div>
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '16px' }}>
                <button
                    class="b3-button b3-button--outline"
                    onClick={openScriptDir}
                    disabled={loading()}
                >
                    <svg class="b3-button__icon"><use href="#iconFolder"></use></svg>
                    打开脚本目录
                </button>
                <button
                    class="b3-button b3-button--outline"
                    onClick={parseAndImport}
                    disabled={loading() || !pythonInfo().available}
                >
                    <svg class="b3-button__icon"><use href="#iconRefresh"></use></svg>
                    重新解析并导入
                </button>
                <button
                    class="b3-button b3-button--outline"
                    onClick={reparseOutdated}
                    disabled={loading() || !pythonInfo().available}
                >
                    <svg class="b3-button__icon"><use href="#iconSync"></use></svg>
                    解析过时脚本
                </button>
                <button
                    class="b3-button b3-button--outline"
                    onClick={loadScriptsFromCache}
                    disabled={loading()}
                >
                    <svg class="b3-button__icon"><use href="#iconRefresh"></use></svg>
                    刷新列表
                </button>
            </div>

            {/* 加载状态 */}
            <Show when={loading()}>
                <div style={{ 'text-align': 'center', padding: '20px', color: 'var(--b3-theme-on-surface-light)' }}>
                    <div class="fn__loading">
                        <div></div>
                    </div>
                    加载中...
                </div>
            </Show>

            {/* 脚本模块列表 */}
            <Show when={!loading() && scripts().length === 0}>
                <div class="b3-card" style={{ padding: '20px', 'text-align': 'center', color: 'var(--b3-theme-on-surface-light)' }}>
                    暂无自定义脚本工具。请将 Python 脚本放入脚本目录后点击「重新解析并导入」。
                </div>
            </Show>

            <Show when={!loading() && scripts().length > 0}>
                <div class="custom-script-modules">
                    <For each={scripts()}>
                        {(module) => (
                            CustomScriptModule(module)
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
};
