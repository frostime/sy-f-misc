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
    loadAndCacheCustomScriptTools,
    openCustomScriptsDir,
    checkPythonAvailable
} from '../tools/custom-program-tools';
import type { ParsedToolModule } from '../tools/custom-program-tools/resolve-tools';
import { solidDialog } from '@/libs/dialog';
import Markdown from '@/libs/components/Elements/Markdown';
import styles from './CustomScriptToolSetting.module.scss';
import { inputDialog } from '@frostime/siyuan-plugin-kits';
import { globalMiscConfigs } from './store';
import { text } from 'stream/consumers';

const exampleScript = `Python 脚本需要遵循一定的规范，并做好类型标注，才能被正确解析为工具。例如：

\`\`\`python
__doc__ = """doc 属性会被当作模块的规则 prompt 使用"""

def _utils():
    # 工具类函数请加上 _ 前缀，避免被解析为工具
    pass

# 请务必做好类型标注，并规范地编写函数注释文档
def add(a: int, b: int) -> int:
    """将两个整数相加并返回结果

    Args:
        a (int): 第一个整数
        b (int): 第二个整数

    Returns:
        int: 两个整数的和

    """
    return a + b


# add.permissionLevel = "moderate"  # 可选，定义工具的权限级别，可选值：public, moderate, sensitive
# add.requireExecutionApproval = True  # 可选，定义是否每次执行都需要用户审批
# add.requireResultApproval = False  # 可选，定义是否需要用户审批结果
\`\`\`
`;

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

    // 重新解析所有脚本
    const parseAndImport = async () => {
        setLoading(true);
        try {
            showMessage('正在解析所有脚本...', 3000, 'info');

            // parseAllScripts 会解析整个目录，不需要传入具体路径
            const result = await parseAllScripts([]);

            if (result.success) {
                showMessage('脚本解析完成，正在重新加载...', 2000, 'info');

                // 重新加载缓存
                await loadAndCacheCustomScriptTools();
                loadScriptsFromCache();

                showMessage('工具定义已更新！', 3000, 'info');
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

    const configureCustomScriptEnvVars = async () => {
        inputDialog({
            title: '配置自定义脚本环境变量, 格式为 KEY=VALUE，每行一个',
            defaultText: globalMiscConfigs().CustomScriptEnvVars || '',
            type: 'textarea',
            width: '600px',
            height: '500px',
            maxHeight: '70%',
            confirm: (text: string) => {
                const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                // check format
                for (const line of lines) {
                    // 允许空值，例如 KEY=
                    if (!/^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(line)) {
                        showMessage(`环境变量格式错误: ${line}`, 5000, 'error');
                        return false;
                    }
                }
                // globalMiscConfigs().CustomScriptEnvVars = text;
                globalMiscConfigs.update('CustomScriptEnvVars', text);
                showMessage('环境变量已保存', 3000);
                return true;
            }
        })
    }



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
        <div class={styles.moduleCard}>
            {/* 模块头部 */}
            <div
                class={`${styles.moduleHeader} ${expandedModules()[module.moduleData.name] ? styles.expanded : ''}`}
                onClick={() => toggleModule(module.moduleData.name)}
            >
                <div class={styles.moduleInfo}>
                    <div class={styles.moduleName}>
                        {module.moduleData.name}
                    </div>
                    <div class={styles.moduleMeta}>
                        <span>📄 {module.scriptName}</span>
                        <span>🛠️ {module.moduleData.tools.length} 个工具</span>
                    </div>
                </div>
                <svg
                    class={`${styles.iconArrow} ${expandedModules()[module.moduleData.name] ? styles.expanded : ''}`}
                >
                    <use href="#iconDown"></use>
                </svg>
            </div>

            {/* 模块详情 */}
            <Show when={expandedModules()[module.moduleData.name]}>
                <div class={styles.moduleContent}>
                    {/* 模块说明 */}
                    <Show when={module.moduleData.rulePrompt}>
                        <div class={styles.rulePrompt}>
                            {module.moduleData.rulePrompt}
                        </div>
                    </Show>

                    {/* 工具列表 */}
                    <div class={styles.toolsHeader}>工具列表:</div>
                    <For each={module.moduleData.tools}>
                        {(tool) => (
                            <div class={styles.toolItem}>
                                <div class={styles.toolHeader}>
                                    <div class={styles.toolInfo}>
                                        <div class={styles.toolName}>
                                            {tool.function.name}()
                                        </div>
                                        <Show when={tool.function.description}>
                                            <div class={styles.toolDescription}>
                                                {tool.function.description}
                                            </div>
                                        </Show>
                                        <Show when={(tool as any).permissionLevel}>
                                            <div class={styles.toolPermission}>
                                                <span
                                                    class={`${styles.badge} ${styles[(tool as any).permissionLevel]}`}
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
        <div class={styles.container}>
            {/* Python 环境状态 */}
            <div class={styles.statusCard}>
                <div class={styles.statusRow}>
                    <span class={styles.label}>Python 环境:</span>
                    <Show
                        when={pythonInfo().available}
                        fallback={
                            <span class={styles.unavailable}>
                                ❌ Python 未安装或不可用
                            </span>
                        }
                    >
                        <span class={styles.available}>
                            ✅ {pythonInfo().version}
                        </span>
                    </Show>
                </div>
            </div>

            {/* 说明信息 */}
            <div class={styles.infoCard}>
                <div class={styles.header}>
                    <span class={styles.title}>
                        <strong>自定义脚本工具</strong>允许你通过 Python 脚本扩展 GPT 工具能力。
                    </span>
                    <button class="b3-button"
                        onClick={() => {
                            solidDialog({
                                title: '关于脚本要求',
                                loader: () => {
                                    return (
                                        <div style={{
                                            padding: '1em'
                                        }}>
                                            <Markdown markdown={exampleScript} />
                                        </div>
                                    )
                                }
                            })
                        }}
                    >
                        关于脚本要求
                    </button>
                </div>
                <ul>
                    <li>将 Python 脚本（.py）放入脚本目录</li>
                    <li>点击「解析所有脚本」生成工具定义并加载到系统</li>
                    <li>脚本中的公开函数将作为工具暴露给 LLM</li>
                    <li>使用类型注解和文档字符串定义工具参数</li>
                </ul>
            </div>

            {/* 操作按钮 */}
            <div class={styles.actionBar}>
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
                    解析所有脚本
                </button>
                <button
                    class="b3-button b3-button--outline"
                    onClick={configureCustomScriptEnvVars}
                    disabled={loading() || !pythonInfo().available}
                >
                    <svg class="b3-button__icon"><use href="#iconSetting"></use></svg>
                    脚本环境变量
                </button>
                {/* <button
                    class="b3-button b3-button--outline"
                    onClick={loadScriptsFromCache}
                    disabled={loading()}
                >
                    <svg class="b3-button__icon"><use href="#iconList"></use></svg>
                    刷新列表界面
                </button> */}
            </div>

            {/* 加载状态 */}
            <Show when={loading()}>
                <div class={styles.loadingContainer}>
                    <div class="fn__loading">
                        <div></div>
                    </div>
                    加载中...
                </div>
            </Show>

            {/* 脚本模块列表 */}
            <Show when={!loading() && scripts().length === 0}>
                <div class={styles.emptyState}>
                    暂无自定义脚本工具。请将 Python 脚本放入脚本目录后点击「解析所有脚本」。
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
