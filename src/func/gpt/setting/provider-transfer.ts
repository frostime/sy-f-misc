/**
 * Provider 复制/粘贴的载荷格式。
 *
 * 载荷是一段可读 JSON，便于跨会话、跨设备粘贴，也便于人工检查：
 *   { "__fmisc": "llm-provider", "version": 1, "provider": { ..., "apiKey": "<混淆后>" } }
 *
 * API Key 复用落盘时的混淆函数（XOR + base62），只是让剪贴板里不出现明文，
 * 不是加密：能拿到载荷的人仍然可以还原它。
 */
import { decodeApiKeyOrRaw, encodeApiKeyIfPlain } from '../model/obfuscate';
import { normalizeProviderProtocol } from '../model/url_utils';

const PAYLOAD_MARK = '__fmisc';
const PAYLOAD_KIND = 'llm-provider';
const PAYLOAD_VERSION = 1;

export type ProviderTransferDecodeResult =
    | { ok: true; provider: ILLMProviderV2 }
    | { ok: false; error: string };

const isPlainObject = (value: unknown): value is Record<string, any> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const encodeProviderTransfer = (provider: ILLMProviderV2): string => {
    return JSON.stringify({
        [PAYLOAD_MARK]: PAYLOAD_KIND,
        version: PAYLOAD_VERSION,
        provider: {
            ...provider,
            apiKey: encodeApiKeyIfPlain(provider.apiKey ?? '')
        }
    }, null, 2);
};

/**
 * 解析并校验剪贴板载荷。任何一项不满足都直接拒绝，不做静默补全：
 * 补全会掩盖复制源本身的问题。
 */
export const decodeProviderTransfer = (text: string): ProviderTransferDecodeResult => {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return { ok: false, error: '剪贴板内容不是合法 JSON' };
    }

    if (!isPlainObject(raw) || raw[PAYLOAD_MARK] !== PAYLOAD_KIND) {
        return { ok: false, error: '剪贴板内容不是 F-Misc 的 Provider 数据' };
    }
    if (raw.version !== PAYLOAD_VERSION) {
        return { ok: false, error: `不支持的 Provider 数据版本：${String(raw.version)}` };
    }

    const provider = raw.provider;
    if (!isPlainObject(provider)) {
        return { ok: false, error: '载荷缺少 provider 字段' };
    }

    const name = typeof provider.name === 'string' ? provider.name.trim() : '';
    if (!name) {
        return { ok: false, error: 'provider.name 必须是非空字符串' };
    }
    if (/[@:]/.test(name)) {
        return { ok: false, error: "provider.name 不能包含 '@' 或 ':'，否则会破坏模型 ID 解析" };
    }
    if (typeof provider.baseUrl !== 'string') {
        return { ok: false, error: 'provider.baseUrl 必须是字符串' };
    }
    if (!Array.isArray(provider.models)) {
        return { ok: false, error: 'provider.models 必须是数组' };
    }
    for (const model of provider.models) {
        if (!isPlainObject(model) || typeof model.model !== 'string' || !model.model.trim()) {
            return { ok: false, error: 'provider.models 中存在缺少 model 名称的条目' };
        }
    }

    return {
        ok: true,
        provider: {
            ...provider,
            name,
            apiKey: typeof provider.apiKey === 'string' ? decodeApiKeyOrRaw(provider.apiKey) : '',
            protocol: normalizeProviderProtocol(provider),
            endpoints: isPlainObject(provider.endpoints) ? provider.endpoints : {},
            disabled: Boolean(provider.disabled),
            customHeaders: isPlainObject(provider.customHeaders) ? provider.customHeaders : undefined,
            models: provider.models as ILLMConfigV2[]
        }
    };
};

/**
 * 副本命名：`<name>(Paste)`，重名时递增为 `<name>(Paste 2)`、`<name>(Paste 3)`……
 * Provider 名参与 `model@provider` 解析，必须唯一。
 */
export const nextPastedProviderName = (sourceName: string, existingNames: Iterable<string>): string => {
    const base = sourceName.trim() || 'Provider';
    const taken = new Set(existingNames);
    const first = `${base}(Paste)`;
    if (!taken.has(first)) return first;

    let suffix = 2;
    while (taken.has(`${base}(Paste ${suffix})`)) suffix++;
    return `${base}(Paste ${suffix})`;
};
