import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeProviderTransfer,
    encodeProviderTransfer,
    nextPastedProviderName
} from '../src/func/gpt/setting/provider-transfer';

const sampleProvider = (): ILLMProviderV2 => ({
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'sk-test-1234567890',
    protocol: 'openai',
    customHeaders: { 'X-Test': '1' },
    disabled: false,
    endpoints: { chat: '/chat/completions' },
    models: [
        {
            model: 'deepseek-chat',
            type: 'chat',
            modalities: { input: ['text'], output: ['text'] },
            capabilities: { tools: true, streaming: true },
            limits: { maxContext: 64000 },
            options: {}
        } as ILLMConfigV2
    ]
});

const payloadOf = (provider: ILLMProviderV2) => JSON.parse(encodeProviderTransfer(provider));

describe('Provider 复制/粘贴载荷', () => {
    it('encode → decode 往返保留全部配置', () => {
        const provider = sampleProvider();
        const decoded = decodeProviderTransfer(encodeProviderTransfer(provider));
        assert.equal(decoded.ok, true);
        if (!decoded.ok) return;

        assert.equal(decoded.provider.name, provider.name);
        assert.equal(decoded.provider.baseUrl, provider.baseUrl);
        assert.equal(decoded.provider.apiKey, provider.apiKey);
        assert.equal(decoded.provider.protocol, 'openai');
        assert.deepEqual(decoded.provider.customHeaders, provider.customHeaders);
        assert.deepEqual(decoded.provider.endpoints, provider.endpoints);
        assert.equal(decoded.provider.models.length, 1);
        assert.equal(decoded.provider.models[0].model, 'deepseek-chat');
    });

    it('剪贴板载荷里没有明文 API Key', () => {
        const text = encodeProviderTransfer(sampleProvider());
        assert.ok(!text.includes('sk-test-1234567890'), 'payload still contains plaintext key');
        assert.notEqual(payloadOf(sampleProvider()).provider.apiKey, 'sk-test-1234567890');
    });

    it('缺省字段补默认值', () => {
        const provider = {
            name: 'Bare',
            baseUrl: '',
            apiKey: '',
            models: []
        } as unknown as ILLMProviderV2;

        const decoded = decodeProviderTransfer(encodeProviderTransfer(provider));
        assert.equal(decoded.ok, true);
        if (!decoded.ok) return;

        assert.equal(decoded.provider.protocol, 'openai');
        assert.deepEqual(decoded.provider.endpoints, {});
        assert.equal(decoded.provider.disabled, false);
        assert.equal(decoded.provider.customHeaders, undefined);
    });

    it('拒绝非法 JSON 与非本插件载荷', () => {
        assert.equal(decodeProviderTransfer('not json').ok, false);
        assert.equal(decodeProviderTransfer('{"foo":1}').ok, false);
        assert.equal(decodeProviderTransfer(JSON.stringify({ __fmisc: 'other', version: 1 })).ok, false);
    });

    it('拒绝不支持的版本', () => {
        const payload = payloadOf(sampleProvider());
        payload.version = 99;
        const decoded = decodeProviderTransfer(JSON.stringify(payload));
        assert.equal(decoded.ok, false);
        if (decoded.ok) return;
        assert.match(decoded.error, /版本/);
    });

    it('拒绝破坏模型 ID 解析的名称', () => {
        const emptyName = payloadOf(sampleProvider());
        emptyName.provider.name = '   ';
        assert.equal(decodeProviderTransfer(JSON.stringify(emptyName)).ok, false);

        const atName = payloadOf(sampleProvider());
        atName.provider.name = 'a@b';
        const decoded = decodeProviderTransfer(JSON.stringify(atName));
        assert.equal(decoded.ok, false);
        if (decoded.ok) return;
        assert.match(decoded.error, /@/);
    });

    it('拒绝结构不合法的 models', () => {
        const notArray = payloadOf(sampleProvider());
        notArray.provider.models = {};
        assert.equal(decodeProviderTransfer(JSON.stringify(notArray)).ok, false);

        const missingModel = payloadOf(sampleProvider());
        missingModel.provider.models = [{ type: 'chat' }];
        assert.equal(decodeProviderTransfer(JSON.stringify(missingModel)).ok, false);
    });
});

describe('粘贴副本命名', () => {
    it('首次粘贴追加 (Paste)', () => {
        assert.equal(nextPastedProviderName('DeepSeek', ['DeepSeek', 'OpenAI']), 'DeepSeek(Paste)');
    });

    it('重名时递增序号', () => {
        assert.equal(
            nextPastedProviderName('DeepSeek', ['DeepSeek', 'DeepSeek(Paste)']),
            'DeepSeek(Paste 2)'
        );
        assert.equal(
            nextPastedProviderName('DeepSeek', ['DeepSeek', 'DeepSeek(Paste)', 'DeepSeek(Paste 2)']),
            'DeepSeek(Paste 3)'
        );
    });

    it('空名称回退到 Provider', () => {
        assert.equal(nextPastedProviderName('   ', []), 'Provider(Paste)');
    });
});
