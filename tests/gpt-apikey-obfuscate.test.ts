import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    encodeApiKey, decodeApiKey,
    decodeApiKeyOrRaw, encodeApiKeyIfPlain
} from '../src/func/gpt/model/obfuscate';

describe('API key 混淆存储', () => {
    const SAMPLE_KEYS = [
        'sk-proj-4f9aXz2Kq8mLpR7TvB3cYdE6nHj1WuSgOiZxAeMfDkQl',
        'ta_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9-token',
        'aB3xY9kL2mQ7vR5tW8zC4nF6hJ1pD0sG',
        'key-with-dashes_and.dots/equals==',
        '中文也行-but-unlikely',
        'x'
    ];

    it('encode → decode 往返一致 (所有样本)', () => {
        for (const key of SAMPLE_KEYS) {
            assert.equal(decodeApiKey(encodeApiKey(key)), key, `roundtrip failed: ${key}`);
        }
    });

    it('encode 幂等: 同一明文永远同一密文 (settings 快照比对依赖)', () => {
        for (const key of SAMPLE_KEYS) {
            assert.equal(encodeApiKey(key), encodeApiKey(key), `not deterministic: ${key}`);
        }
    });

    it('密文外观: 纯字母数字, 无明文特征泄露', () => {
        for (const key of SAMPLE_KEYS) {
            const cipher = encodeApiKey(key);
            assert.match(cipher, /^[A-Za-z0-9]+$/);
            assert.doesNotMatch(cipher, /sk-|eyJ|Bearer|-|_|=|\./);
        }
    });

    it('短明文长度不会泄露: 密文长度不等于明文长度', () => {
        for (const key of SAMPLE_KEYS) {
            assert.notEqual(encodeApiKey(key).length, key.length);
        }
    });

    it('decode: 旧明文 key → null (自动兼容路径)', () => {
        for (const key of SAMPLE_KEYS) {
            assert.equal(decodeApiKey(key), null, `plaintext misidentified: ${key}`);
        }
    });

    it('decode: 普通 base62 样式但非密文的字符串 → null', () => {
        assert.equal(decodeApiKey('YrS7uJ4wLKmNr2nXq'), null);  // 假 base62 key
        assert.equal(decodeApiKey('aQm84nP2xR9tKv'), null);
        assert.equal(decodeApiKey('11111111111111111111111111'), null);
    });

    it('decode: 拆改密文的任何一部分 → null (完整性)', () => {
        const cipher = encodeApiKey('sk-proj-4f9aXz2Kq8mLpR7TvB3cYdE6nHj1WuSgOiZxAeMfDkQl');
        // 篡改任意字符
        for (let i = 0; i < cipher.length; i += 7) {
            const tampered = cipher.slice(0, i) + (cipher[i] === 'A' ? 'B' : 'A') + cipher.slice(i + 1);
            assert.notEqual(decodeApiKey(tampered), 'sk-proj-4f9aXz2Kq8mLpR7TvB3cYdE6nHj1WuSgOiZxAeMfDkQl',
                `tampered cipher decoded: index ${i}`);
        }
        // 截断
        assert.equal(decodeApiKey(cipher.slice(1)), null);
        assert.equal(decodeApiKey(cipher.slice(0, -1)), null);
    });

    it('decodeApiKeyOrRaw: 密文→明文, 明文→原样', () => {
        const key = 'sk-proj-test123-___';
        assert.equal(decodeApiKeyOrRaw(encodeApiKey(key)), key);
        assert.equal(decodeApiKeyOrRaw(key), key);
    });

    it('encodeApiKeyIfPlain: 明文→密文, 密文→原样 (防二次加密 + 定型迁移)', () => {
        const key = 'sk-proj-test123';
        const cipher = encodeApiKeyIfPlain(key);
        assert.notEqual(cipher, key);
        assert.equal(decodeApiKey(cipher), key);
        // 再来一次: 已密文不再变化
        assert.equal(encodeApiKeyIfPlain(cipher), cipher);
    });

    it('边界: 空字符串原样通过', () => {
        assert.equal(encodeApiKey(''), '');
        assert.equal(decodeApiKey(''), null);
        assert.equal(decodeApiKeyOrRaw(''), '');
        assert.equal(encodeApiKeyIfPlain(''), '');
    });

    it('大样本: 已知非密文的真实格式 key 不会误判 (碰撞模拟)', () => {
        // 纯字母数字的 key 格式 — 最容易碰巧通过结构形式的样例, 验证 checksum 拦截
        const plausible = [
            'Qm7kY2nF9xV4rT8wL5pZ3hJ6bC1dS0aG',
            'Rn4mQ8tW2yU6iO9pA1sD5fG7hJ3kL0zX',
            'Tk9wE3rY5uI8oP2aS4dF6gH1jK7lZx0C'
        ];
        for (const key of plausible) {
            assert.equal(decodeApiKey(key), null, `false positive: ${key}`);
        }
    });
});
