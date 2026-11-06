/**
 * 模型清单的展示视图：过滤、按 provider 分组、价格文本、同款模型比价。
 *
 * 这里刻意只放纯函数，不依赖 Solid 与 SiYuan 运行时，便于在 node 里直接验证；
 * 组件（chat/components/ModelPicker.tsx）只负责渲染和交互。
 *
 * 约定：
 * - 价格一律按每 1M tokens 计，`↑` 输入、`↓` 输出。
 * - 货币属于 provider 维度：整组同币种时符号只在组标题出现，组内混币种才逐行带符号。
 */
import type { IAvailableModelEntry } from './model_resolution';

export interface IModelGroup {
    provider: string;
    /** 组标题里显示的货币符号；组内混币种或无价格时为空串 */
    symbol: string;
    entries: IAvailableModelEntry[];
}

const PRICE_SYMBOLS: Record<string, string> = { USD: '$', CNY: '¥' };

/** 未知单位退化为原文字符串，不做汇率换算 */
export const currencySymbol = (unit?: string) => {
    if (!unit) return '';
    return PRICE_SYMBOLS[unit] ?? `${unit} `;
};

const priceSides = (price?: ILLMConfigV2['price']) => {
    const side = (value?: number) =>
        typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
    return { input: side(price?.inputPerM), output: side(price?.outputPerM) };
};

const numberText = (value: number) => String(Number(value.toFixed(4)));

export const contextText = (tokens?: number) => {
    if (!tokens) return '';
    return tokens >= 1_000_000
        ? `${Number((tokens / 1_000_000).toFixed(1))}M`
        : `${Math.round(tokens / 1000)}K`;
};

/** 有任意一侧的标价即视为"有价"；0 与缺省都视作未填 */
export const hasPrice = (entry: IAvailableModelEntry) => {
    const { input, output } = priceSides(entry.config?.price);
    return input !== undefined || output !== undefined;
};

/**
 * 单行纯文本价格，例如 `¥2↑/¥8↓ 每M`；没有记录价格时返回空串。
 * 供只能显示纯文本的入口（`<select>`）与设置页模型列表使用。
 */
export const formatModelPrice = (price?: ILLMConfigV2['price']): string => {
    const { input, output } = priceSides(price);
    if (input === undefined && output === undefined) return '';
    const symbol = currencySymbol(price?.unit);
    const parts: string[] = [];
    if (input !== undefined) parts.push(`${symbol}${numberText(input)}↑`);
    if (output !== undefined) parts.push(`${symbol}${numberText(output)}↓`);
    return `${parts.join('/')} 每M`;
};

export const capabilitiesOf = (entry: IAvailableModelEntry) => {
    const caps: string[] = [];
    if (entry.config?.capabilities?.tools === true) caps.push('工具调用');
    if (entry.config?.capabilities?.reasoning === true) caps.push('推理');
    if (entry.config?.modalities?.input?.includes('image')) caps.push('图像输入');
    return caps;
};

export const filterModelEntries = (entries: IAvailableModelEntry[], keyword: string) => {
    const q = keyword.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(entry =>
        entry.displayName.toLowerCase().includes(q)
        || entry.model.toLowerCase().includes(q)
        || entry.provider.toLowerCase().includes(q));
};

/** 按 provider 分组；同一 provider 的条目在输入里本来就是连续的 */
export const groupModelEntries = (entries: IAvailableModelEntry[]): IModelGroup[] => {
    const groups: IModelGroup[] = [];
    for (const entry of entries) {
        let group = groups[groups.length - 1];
        if (!group || group.provider !== entry.provider) {
            group = { provider: entry.provider, symbol: '', entries: [] };
            groups.push(group);
        }
        group.entries.push(entry);
    }
    for (const group of groups) {
        // 缺 unit 的有价行也算一种"币种"，否则会被组标题的符号误标成同一货币
        const units = new Set(group.entries.filter(hasPrice).map(entry => entry.config?.price?.unit ?? ''));
        group.symbol = units.size === 1 ? currencySymbol([...units][0]) : '';
    }
    return groups;
};

/** 行内价格：最弱的一档，只给数字和方向；组内已显示货币时不重复符号 */
export const compactPriceText = (entry: IAvailableModelEntry, groupSymbol: string) => {
    const { input, output } = priceSides(entry.config?.price);
    if (input === undefined && output === undefined) return '—';
    const prefix = groupSymbol ? '' : currencySymbol(entry.config?.price?.unit);
    const parts: string[] = [];
    if (input !== undefined) parts.push(`${prefix}${numberText(input)}↑`);
    if (output !== undefined) parts.push(`${prefix}${numberText(output)}↓`);
    return parts.join(' ');
};

/** 悬浮详情里的完整价格，始终带货币符号 */
export const fullPriceText = (entry: IAvailableModelEntry) => {
    const { input, output } = priceSides(entry.config?.price);
    if (input === undefined && output === undefined) return '未标价';
    const symbol = currencySymbol(entry.config?.price?.unit);
    const text = (value?: number) => value === undefined ? '—' : `${symbol}${numberText(value)}`;
    return `${text(input)} / ${text(output)}`;
};

/**
 * 同一模型（同服务类型）在其它 provider 的报价，按输入价升序。
 * 只统计有价格的条目；`limit` 用于避免悬浮面板过高，超出部分用 `rest` 告知。
 */
export const compareSameModel = (entries: IAvailableModelEntry[], target: IAvailableModelEntry, limit = 6) => {
    const rows = entries
        .filter(entry => entry.model === target.model && entry.type === target.type)
        .map(entry => {
            const sides = priceSides(entry.config?.price);
            return { entry, input: sides.input ?? 0, priced: sides.input !== undefined || sides.output !== undefined };
        })
        .filter(row => row.priced)
        .sort((a, b) => a.input - b.input);
    return { rows: rows.slice(0, limit).map(row => row.entry), rest: Math.max(0, rows.length - limit) };
};
