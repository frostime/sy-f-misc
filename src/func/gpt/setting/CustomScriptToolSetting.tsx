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
    parseAllPythonScripts,
    parseAllPowerShellScripts,
    loadAndCacheCustomScriptTools,
    openCustomScriptsDir,
    checkPythonAvailable,
    checkPowerShellAvailable
} from '../tools/custom-program-tools';
import type { ParsedToolModule } from '../tools/custom-program-tools/resolve-tools';
import { documentDialog } from '@/libs/dialog';
import styles from './CustomScriptToolSetting.module.scss';
import { inputDialog } from '@frostime/siyuan-plugin-kits';
import { globalMiscConfigs } from '../model/store';


const exampleScriptPython = `允许编写 Python 脚本来扩展 LLM 能力。.py 脚本将被自动解析为 LLM Tools。

Python 脚本需要遵循一定的规范，并做好类型标注。例如：

\`\`\`python
import os

__doc__ = """doc 属性会被当作模块的规则 prompt 使用"""

API_KEY = os.getenv('你自己定义的变量')

def _utils():
    # 工具类函数请加上 _ 前缀，避免被解析为工具
    pass


# 做好类型标注和文档注释; 确保返回结果只有一个；不要返回 tuple!
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


def get_weather(city: str) -> str:
    """获取指定城市的天气信息

    Args:
        city (str): 城市名称

    Returns:
        dict: {'city': str, 'temperature': int, 'condition': str }
            condition 可以是 '晴朗', '多云', '雨天' 等等

    """
    temp = os.getenv('DEFAULT_TEMPERATURE', '25')
    # 这里是一个模拟实现，实际应用中应调用天气API获取数据
    return {'temperature': temp, 'condition': '晴朗'}


# 或者 get_weather 返回复杂类型; 增加 format 函数用来专门格式化给 LLM 看
# 插件的机制是 ToolCall --> [Data Result] --> Format [String] --> Truncate/Cache --> LLM
# 而在调用 ToolCallScript 工具的时候，await TOOL_CALL 会直接返回 [Data Result]
get_weather.format = (
    lambda ans,
    args: f"{args['city']}的天气{ans['condition']}，温度{ans['temperature']}摄氏度。"
)
\`\`\`

插件会解析脚本，并将 \`add\`, \`get_weather\` 函数作为工具暴露给 LLM 使用。

**返回**: 可以返回 str，也可以返回 dict 或者 list; 但不要返回多个参数
**特殊属性**:
- \`permissionLevel/requireExecutionApproval/requireResultApproval\`: 配置工具的权限
- \`format(result: ReturnTypeOfFun, args: dict) -> str\`: 定义如何将返回结果格式化为字符串供 LLM 阅读
`;

const exampleScriptPowerShell = `允许编写 PowerShell 脚本来扩展 LLM 能力。

PowerShell 脚本需要遵循 Comment-Based Help 规范：

\`\`\`powershell
<#
.SYNOPSIS
文件操作工具集

.DESCRIPTION
提供常用的文件系统操作功能
#>

# TOOL_CONFIG: { "permissionLevel": "moderate", "requireResultApproval": true }

function Get-FilePreview {
    <#
    .SYNOPSIS
    预览文件内容

    .PARAMETER Path
    文件路径

    .PARAMETER Lines
    预览行数

    .PARAMETER Mode
    模式：head 从头部，tail 从尾部

    .OUTPUTS
    object 包含 content, totalLines, displayedLines 属性
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [int]$Lines = 50,

        [ValidateSet('head', 'tail')]
        [string]$Mode = 'head'
    )

    # 实现逻辑...
}
\`\`\`

**关键要点**:
- 使用 \`[CmdletBinding()]\` 和 \`param()\` 块定义参数
- \`[Parameter(Mandatory=$true)]\` 标记必需参数
- \`[ValidateSet()]\` 定义枚举值
- \`.OUTPUTS\` 描述返回值类型
- \`TOOL_CONFIG\` 注释配置权限
`;

/**
 * 自定义脚本工具设置组件
 */
export const CustomScriptToolSetting: Component = () => {
    const [scripts, setScripts] = createSignal<ParsedToolModule[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [pythonInfo, setPythonInfo] = createSignal<{ available: boolean; version?: string; error?: string }>({ available: false });
    const [powershellInfo, setPowershellInfo] = createSignal<{ available: boolean; version?: string; error?: string }>({ available: false });
    const [expandedModules, setExpandedModules] = createSignal<Record<string, boolean>>({});

    // 检查环境
    const checkEnvironment = async () => {
        const [pyInfo, psInfo] = await Promise.all([
            checkPythonAvailable(),
            checkPowerShellAvailable()
        ]);
        setPythonInfo(pyInfo);
        setPowershellInfo(psInfo);
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

            // 分别解析 Python 和 PowerShell
            const [pyResult, psResult] = await Promise.all([
                parseAllPythonScripts([]),
                parseAllPowerShellScripts([])
            ]);

            const allSuccess = pyResult.success && psResult.success;
            const errors = [...pyResult.errors, ...psResult.errors];

            if (allSuccess) {
                showMessage('脚本解析完成，正在重新加载...', 2000, 'info');

                // 重新加载缓存
                await loadAndCacheCustomScriptTools();
                loadScriptsFromCache();

                showMessage('工具定义已更新！', 3000, 'info');
            } else {
                const errorMsg = errors.map(e => `${e.script}: ${e.error}`).join('\n');
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
            width: '1000px',
            height: '640px',
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
        checkEnvironment();
        loadScriptsFromCache();
    });

    const CustomScriptModule = (module: ParsedToolModule) => {
        // 获取脚本类型图标
        const getScriptIcon = () => {
            return module.scriptType === 'python' ? '🐍' : '⚡';
        };

        const getScriptLabel = () => {
            return module.scriptType === 'python' ? 'Python' : 'PowerShell';
        };

        return (
            <div class={styles.moduleCard}>
                {/* 模块头部 */}
                <div
                    class={`${styles.moduleHeader} ${expandedModules()[module.moduleData.name] ? styles.expanded : ''}`}
                    onClick={() => toggleModule(module.moduleData.name)}
                >
                    <div class={styles.moduleInfo}>
                        <div class={styles.moduleName}>
                            {getScriptIcon()} {module.moduleData.name}
                            <span class={styles.scriptType}>[{getScriptLabel()}]</span>
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
        );
    }

    return (
        <div class={styles.container}>
            {/* 环境状态 */}
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
                <div class={styles.statusRow}>
                    <span class={styles.label}>PowerShell 环境:</span>
                    <Show
                        when={powershellInfo().available}
                        fallback={
                            <span class={styles.unavailable}>
                                ❌ PowerShell 未安装或不可用
                            </span>
                        }
                    >
                        <span class={styles.available}>
                            ✅ {powershellInfo().version}
                        </span>
                    </Show>
                </div>
            </div>

            {/* 说明信息 */}
            <div class={styles.infoCard}>
                <div class={styles.header}>
                    <span class={styles.title}>
                        <strong>自定义脚本工具</strong>允许你通过 Python 或 PowerShell 脚本扩展 GPT 工具能力。
                    </span>
                    <button class="b3-button"
                        onClick={() => {
                            documentDialog({
                                title: 'Python 脚本示例',
                                markdown: exampleScriptPython,
                            });
                        }}
                    >
                        Python 规范
                    </button>
                    <button class="b3-button"
                        onClick={() => {
                            documentDialog({
                                title: 'PowerShell 脚本示例',
                                markdown: exampleScriptPowerShell,
                            });
                        }}
                    >
                        PowerShell 规范
                    </button>
                </div>
                <ul>
                    <li>将 Python (.py) 或 PowerShell (.ps1) 脚本放入脚本目录</li>
                    <li>点击「解析所有脚本」生成工具定义并加载到系统</li>
                    <li>脚本中的公开函数将作为工具暴露给 LLM</li>
                    <li>Python 使用类型注解和文档字符串，PowerShell 使用 Comment-Based Help</li>
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
                    disabled={loading() || (!pythonInfo().available && !powershellInfo().available)}
                >
                    <svg class="b3-button__icon"><use href="#iconRefresh"></use></svg>
                    解析所有脚本
                </button>
                <button
                    class="b3-button b3-button--outline"
                    onClick={configureCustomScriptEnvVars}
                    disabled={loading()}
                >
                    <svg class="b3-button__icon"><use href="#iconSettings"></use></svg>
                    脚本环境变量
                </button>
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
                    暂无自定义脚本工具。请将脚本放入脚本目录后点击「解析所有脚本」。
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
