/**
 * Provider 连通性测试。
 *
 * 只验证「真实请求能否走通」：复用 complete() 的完整链路（协议适配、endpoint 解析、
 * 鉴权、模型名），因此能发现 GET /models 查不出的问题（模型名写错、协议选错）。
 *
 * 约束：
 * - 只针对 chat 类型模型；不发任何推理/工具参数，避免把 thinking 预算带进最小请求
 * - 不设置 max_tokens：部分模型不接受该参数，测试不应因此误判
 * - 超时与弹窗关闭都通过 AbortController 中断
 */
import { normalizeProviderProtocol } from '../model/url_utils';
import { resolveEndpointUrl } from '../model/store';
import { complete } from '../openai/complete';

export const PROVIDER_TEST_TIMEOUT_MS = 20_000;
export const PROVIDER_TEST_PROMPT = 'ping';

export type ProviderTestOutcome =
    | { ok: true; elapsedMs: number; model: string; reply: string }
    | { ok: false; elapsedMs: number; model: string; error: string };

export const isChatModel = (model: ILLMConfigV2): boolean => {
    const types = Array.isArray(model.type) ? model.type : [model.type];
    return types.includes('chat');
};

/** 使用 Provider 下第一个启用的 chat 模型 */
export const pickTestModel = (provider: ILLMProviderV2): ILLMConfigV2 | undefined =>
    provider.models?.find(model => !model.disabled && isChatModel(model));

const buildRuntimeModel = (provider: ILLMProviderV2, modelConfig: ILLMConfigV2): IRuntimeLLM => ({
    bareId: `${modelConfig.model}@${provider.name}`,
    model: modelConfig.model,
    type: 'chat',
    protocol: normalizeProviderProtocol(provider),
    url: resolveEndpointUrl(provider, 'chat'),
    apiKey: provider.apiKey,
    config: modelConfig,
    provider
});

export const testProviderConnection = async (
    provider: ILLMProviderV2,
    options: { timeoutMs?: number; abortSignal?: AbortSignal } = {}
): Promise<ProviderTestOutcome> => {
    const modelConfig = pickTestModel(provider);
    if (!modelConfig) {
        return { ok: false, elapsedMs: 0, model: '', error: '该 Provider 没有可用的 chat 模型' };
    }

    const model = modelConfig.model;
    const timeoutMs = options.timeoutMs ?? PROVIDER_TEST_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;

    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    const forwardAbort = () => controller.abort();
    if (options.abortSignal) {
        if (options.abortSignal.aborted) {
            controller.abort();
        } else {
            options.abortSignal.addEventListener('abort', forwardAbort, { once: true });
        }
    }

    const t0 = Date.now();
    try {
        const result = await complete(PROVIDER_TEST_PROMPT, {
            model: buildRuntimeModel(provider, modelConfig),
            stream: false,
            abortController: controller
        });
        const elapsedMs = Date.now() - t0;

        if (result.ok) {
            return { ok: true, elapsedMs, model, reply: (result.content ?? '').trim() };
        }
        return {
            ok: false,
            elapsedMs,
            model,
            error: timedOut ? `请求超时（${timeoutMs}ms）` : (result.content || '未知错误')
        };
    } catch (error) {
        const elapsedMs = Date.now() - t0;
        return {
            ok: false,
            elapsedMs,
            model,
            error: timedOut
                ? `请求超时（${timeoutMs}ms）`
                : (error instanceof Error ? error.message : String(error))
        };
    } finally {
        clearTimeout(timer);
        options.abortSignal?.removeEventListener('abort', forwardAbort);
    }
};
