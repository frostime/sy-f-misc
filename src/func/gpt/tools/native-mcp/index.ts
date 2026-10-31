import { useSignalRef } from '@frostime/solid-signal-ref';
import { ToolExecuteStatus, type Tool, type ToolExecuteResult, type ToolGroup } from '../types';
import { NativeMcpClient, type NativeMcpTool } from './client';
import { DEFAULT_LIMIT_CHAR, truncateContent } from '../utils';

export const NATIVE_MCP_GROUP_NAME = '思源原生 MCP';
const TOOL_PREFIX = 'sy_mcp_';
const STARTUP_TIMEOUT_MS = 5000;

type StartupState =
    | { status: 'off' | 'loading' }
    | { status: 'ready'; toolCount: number; skippedTools: string[] }
    | { status: 'unavailable'; reason: string };

const startupState = useSignalRef<StartupState>({ status: 'off' });
let current: { client: NativeMcpClient; group?: ToolGroup } | undefined;

export const nativeMcpState = (): Readonly<StartupState> => startupState();
export const getNativeMcpGroup = (): ToolGroup | undefined => current?.group;

/** Discover once per GPT activation; failure disables only this source, never ordinary chat. */
export const initializeNativeMcp = async (lifetime: AbortSignal): Promise<void> => {
    if (lifetime.aborted) return;
    void current?.client.close();
    const runtime: NonNullable<typeof current> = { client: new NativeMcpClient(lifetime) };
    current = runtime;
    startupState({ status: 'loading' });
    const startup = new AbortController();
    const timer = setTimeout(() => startup.abort(new Error('原生 MCP 启动超过 5 秒')), STARTUP_TIMEOUT_MS);
    try {
        const definitions = await runtime.client.initialize(startup.signal);
        if (current !== runtime || lifetime.aborted) return;
        const tools: Tool[] = [];
        const skippedTools: string[] = [];
        for (const definition of definitions) {
            try {
                tools.push(adaptNativeTool(definition, runtime.client));
            } catch (error) {
                skippedTools.push(`${definition.name}: ${errorMessage(error)}`);
            }
        }
        runtime.group = {
            name: NATIVE_MCP_GROUP_NAME,
            defaultToolEnabled: false,
            tools,
            rulePrompt: `这些工具来自当前思源宿主的 MCP。原生名称 t 对应 ${TOOL_PREFIX}t（如 system 对应 ${TOOL_PREFIX}system）。原生技能正文中的工具原名按此对应；本插件不提供原生 Agent 会话或技能工作流授权。原生工具的 limit 按各自参数定义控制条数/行数，不是输出字符上限。`,
        };
        startupState({ status: 'ready', toolCount: tools.length, skippedTools });
    } catch (error) {
        if (current !== runtime || lifetime.aborted) return;
        current = undefined;
        startupState({ status: 'unavailable', reason: errorMessage(startup.signal.aborted ? startup.signal.reason : error) });
        // Session cleanup must not extend the bounded GPT startup wait.
        void runtime.client.close();
    } finally {
        clearTimeout(timer);
    }
};

export const closeNativeMcp = (): Promise<void> => {
    const runtime = current;
    current = undefined;
    startupState({ status: 'off' });
    return runtime?.client.close() ?? Promise.resolve();
};

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** This is the common schema subset preserved by all current Provider adapters, not a translator. */
const validateSchema = (schema: unknown, root = false): void => {
    if (!isObject(schema)) throw new Error('输入 schema 必须是对象');
    const allowed = root
        ? ['type', 'properties', 'required']
        : ['type', 'description', 'enum', 'items', 'properties', 'required', 'minimum', 'maximum'];
    const unsupported = Object.keys(schema).filter(key => !allowed.includes(key));
    if (unsupported.length) throw new Error(`暂不支持 schema 关键字 ${unsupported.join(', ')}`);
    if (root ? schema.type !== 'object' : !['string', 'number', 'integer', 'boolean', 'object', 'array'].includes(String(schema.type))) {
        throw new Error('暂不支持此 schema type');
    }
    if (schema.description !== undefined && typeof schema.description !== 'string') throw new Error('schema description 必须是字符串');
    if (schema.enum !== undefined && !Array.isArray(schema.enum)) throw new Error('schema enum 必须是数组');
    if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every(item => typeof item === 'string'))) {
        throw new Error('schema required 必须是字符串数组');
    }
    for (const key of ['minimum', 'maximum']) {
        if (schema[key] !== undefined && typeof schema[key] !== 'number') throw new Error(`schema ${key} 必须是数字`);
    }
    if (root || schema.properties !== undefined) {
        if (!isObject(schema.properties)) throw new Error('schema properties 必须是对象');
        Object.values(schema.properties).forEach(property => validateSchema(property));
    }
    if (schema.items !== undefined) validateSchema(schema.items);
};

const adaptNativeTool = (definition: NativeMcpTool, client: NativeMcpClient): Tool => {
    const name = `${TOOL_PREFIX}${definition.name}`;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error('工具名称无法表示为模型函数名');
    validateSchema(definition.inputSchema, true);
    return {
        definition: {
            type: 'function',
            function: {
                name,
                description: `[思源原生 MCP: ${definition.name}] ${definition.description ?? ''}`,
                // The untrusted schema is checked above before entering the existing tool type.
                parameters: definition.inputSchema as IToolDefinition['function']['parameters'],
            },
        },
        permission: { executionPolicy: 'ask-always', resultApprovalPolicy: 'never' },
        // Native limit means rows/entries, not the executor's generic output-character limit.
        truncateForLLM: text => truncateContent(text, DEFAULT_LIMIT_CHAR).content,
        execute: async args => {
            try {
                return adaptNativeResult(await client.callTool(definition.name, args));
            } catch (error) {
                return {
                    status: ToolExecuteStatus.ERROR,
                    error: `原生 MCP 调用失败：${errorMessage(error)}。若请求已发出，操作可能已执行；本插件未自动重试。`,
                };
            }
        },
    };
};

const adaptNativeResult = (result: unknown): ToolExecuteResult => {
    if (!isObject(result)) return { status: ToolExecuteStatus.ERROR, error: '原生 MCP 工具结果格式错误，不能确认返回内容完整。' };
    const sections: string[] = [];
    const problems: string[] = [];
    const unsupported = new Set<string>();
    if (result.content !== undefined) {
        if (!Array.isArray(result.content)) {
            problems.push('content 不是数组');
        } else {
            for (const content of result.content) {
                if (isObject(content) && content.type === 'text' && typeof content.text === 'string') {
                    sections.push(content.text);
                } else if (isObject(content) && content.type === 'text') {
                    problems.push('text 内容缺少有效的 text 字符串');
                } else {
                    unsupported.add(isObject(content) && typeof content.type === 'string' ? content.type : '无效 content');
                }
            }
        }
    }
    if (result.structuredContent !== undefined) {
        if (isObject(result.structuredContent)) sections.push(`[structuredContent]\n${JSON.stringify(result.structuredContent, null, 2)}`);
        else problems.push('structuredContent 不是对象');
    }
    if (result.isError !== undefined && typeof result.isError !== 'boolean') problems.push('isError 不是布尔值');
    if (result.isError === true) problems.push('原生工具报告错误');
    if (unsupported.size) problems.push(`暂不支持返回内容类型：${[...unsupported].join(', ')}`);
    const text = sections.join('\n\n');
    if (problems.length) {
        return {
            status: ToolExecuteStatus.ERROR,
            // Executor derives error finalText from this field; data alone would disappear from the model response.
            error: `${problems.join('；')}。返回内容可能不完整，操作可能已执行；本插件未自动重试。${text ? `\n\n${text}` : ''}`,
        };
    }
    return { status: ToolExecuteStatus.SUCCESS, data: text };
};
