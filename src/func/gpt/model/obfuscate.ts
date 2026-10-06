/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Description  : API key 混淆存储
 *
 * 目标: gpt.config.json 中的 API key 不以可识别明文存储 (sk-..., Bearer, JWT 等),
 *       避免密钥被"看一眼直接拿走用"。
 *       不是加密安全: 混淆密钥随代码打包, 不防针对性破解。
 *
 * 原理: payload = [VERSION, salt, checksum(2B), XOR(data)]
 *       - VERSION: 格式版本字节, 兜底未来更换混淆密钥时的代际识别
 *       - salt:    由明文确定性派生 (0~255), 随 payload 保存。
 *                  不用随机盐: settings 持久化层依赖 snapshot 的确定性做变更检测,
 *                  同一明文必须永远得到同一密文 (encode 幂等)。
 *       - checksum: 明文 + salt 的 FNV-1a 16bit 校验和, 解码时自校验
 *       - 全部字节经 base62 重映射 (纯字母数字, 无 base64 的 +/= 特征)
 *
 * 关键性质: decode() 对任何字符串运行, 成功即"是我们的密文", null 即"不是":
 *       旧明文 → null → 原样通过 → 自动兼容
 *       已密文 → 明文 → 防二次加密
 */

// FIXME(config-decision): 混淆密钥, 随 bundle 分发。更换时须升级 VERSION 并保留旧 key 兼容。
const OBFUSCATION_KEY = 'fmisc-llm-obfuscate-2026';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const VERSION = 0x1f;
const HEADER_BYTES = 4; // VERSION + salt + checksum(2B)
const MIN_CIPHER_BYTES = HEADER_BYTES + 1; // payload 最少 5 字节, 有效 1 个字符的 key
/** salt 派生种子: 避免与 checksum 直接同 seed */
const CONFIG_SALT_SEED = 0x2f6d;

/** FNV-1a 16bit, seed 混入初始值 */
const fnv16 = (bytes: readonly number[], seed: number): number => {
    let hash = (0x811c ^ seed) >>> 0;
    for (const byte of bytes) {
        hash ^= byte;
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash & 0xffff;
};

/** base62 双向映射: 编码字符表 + 解码用字符→值查询 */
const BASE62_INDEX = new Map([...BASE62].map((ch, index) => [ch, index]));

const bytesToBase62 = (bytes: readonly number[]): string => {
    let num = 0n;
    for (const byte of bytes) num = (num << 8n) | BigInt(byte);
    let encoded = '';
    if (num === 0n) return BASE62[0];
    while (num > 0n) {
        encoded = BASE62[Number(num % 62n)] + encoded;
        num /= 62n;
    }
    return encoded;
};

const base62ToBytes = (text: string): number[] | null => {
    let num = 0n;
    for (const ch of text) {
        const value = BASE62_INDEX.get(ch);
        if (value === undefined) return null;
        num = num * 62n + BigInt(value);
    }
    let hex = num.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    return hex.match(/../g)!.map(part => parseInt(part, 16));
};

/** 加密一个 API key (或任何短文本); 对同一明文结果恒定 (幂等) */
export const encodeApiKey = (plaintext: string): string => {
    if (!plaintext) return plaintext;
    const data = [...new TextEncoder().encode(plaintext)];
    // salt 确定性派生: 保证 encode 幂等 (settings 持久层的比对依赖此性质)
    const salt = fnv16(data, CONFIG_SALT_SEED) & 0xff;
    const checksum = fnv16(data, salt);
    const payload = [
        VERSION,
        salt,
        checksum >>> 8,
        checksum & 0xff,
        ...data.map((byte, i) => byte ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length) ^ salt)
    ];
    return bytesToBase62(payload);
};

/**
 * 尝试解码一个存储的 key 字段值。
 * 是我们的密文 → 返回明文; 否则 (旧明文 / 用户输入 / 任意文本) → null。
 * 判据: 纯 base62 + 长度 + 版本字节 + payload 结构 + checksum 全部通过。
 */
export const decodeApiKey = (stored: string | undefined | null): string | null => {
    if (!stored || !/^[A-Za-z0-9]+$/.test(stored) || stored.length < 6) return null;
    const bytes = base62ToBytes(stored);
    if (!bytes || bytes.length <= HEADER_BYTES || bytes[0] !== VERSION) return null;

    const [, salt, checksumHigh, checksumLow, ...xored] = bytes;
    const data = xored.map((byte, i) => byte ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length) ^ salt);
    if (fnv16(data, salt) !== ((checksumHigh << 8) | checksumLow)) return null;
    return new TextDecoder().decode(new Uint8Array(data));
};

/** 载入时使用: 密文 → 明文, 非密文 → 原样 (旧明文兼容) */
export const decodeApiKeyOrRaw = (stored: string): string => decodeApiKey(stored) ?? stored;

/** 保存时使用: 明文 → 密文, 已是密文 → 原样 (防二次加密) */
export const encodeApiKeyIfPlain = (stored: string): string => decodeApiKey(stored) ? stored : encodeApiKey(stored);

export const SENSITIVE_GLOBAL_KEYS = ['tavilyApiKey', 'bochaApiKey', 'googleApiKey', 'CustomScriptEnvVars'] as const;

/** 描述某个用作 key 存储的字段是否被本模块混淆 (供 UI/迁移日志判断) */
export const isObfuscationField = (name: string) =>
    (SENSITIVE_GLOBAL_KEYS as readonly string[]).includes(name) || name.startsWith('llmProviders');
