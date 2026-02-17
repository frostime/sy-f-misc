// https://context7.com/docs/api-guide
// 使用 V2 版本 API

import type { Context7ResponseType } from "./config";

export interface IContext7Library {
	id: string;
	name: string;
	description?: string;
	totalSnippets?: number;
	trustScore?: number;
	benchmarkScore?: number;
	versions?: string[];
}

export interface IContext7Snippet {
	title: string;
	content: string;
	source?: string;
}

export interface IContext7RequestOptions {
	apiKey?: string;
	baseUrl?: string;
	timeoutMs?: number;
}

export interface IContext7GetContextParams extends IContext7RequestOptions {
	query: string;
	libraryId: string;
	type?: Context7ResponseType;
}

export interface IContext7SearchParams extends IContext7RequestOptions {
	query: string;
	libraryName: string;
}

export class Context7Error extends Error {
	status?: number;
	code?: string;
	detail?: unknown;

	constructor(message: string, options?: { status?: number; code?: string; detail?: unknown }) {
		super(message);
		this.name = 'Context7Error';
		this.status = options?.status;
		this.code = options?.code;
		this.detail = options?.detail;
	}
}

const DEFAULT_BASE_URL = 'https://context7.com/api/v2';
const DEFAULT_TIMEOUT = 20000;

const normalizeBaseUrl = (baseUrl?: string) => {
	const value = String(baseUrl || '').trim();
	if (!value) return DEFAULT_BASE_URL;
	return value.replace(/\/+$/, '');
};

const normalizeTimeout = (timeoutMs?: number) => {
	const value = Number(timeoutMs ?? DEFAULT_TIMEOUT);
	if (!Number.isFinite(value) || value < 1000) return DEFAULT_TIMEOUT;
	return Math.floor(value);
};

const ensureApiKey = (apiKey?: string) => {
	const token = String(apiKey || '').trim();
	if (!token) {
		throw new Context7Error('缺少 Context7 API Key，请先在配置中填写。', { code: 'missing_api_key' });
	}
	return token;
};

const buildUrl = (baseUrl: string, path: string, params: Record<string, string | undefined>) => {
	const url = new URL(`${baseUrl}${path}`);
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue;
		const next = String(value).trim();
		if (!next) continue;
		url.searchParams.set(key, next);
	}
	return url;
};

const parseErrorMessage = async (response: Response) => {
	const text = await response.text();
	if (!text) return response.statusText || `HTTP ${response.status}`;
	try {
		const data = JSON.parse(text);
		if (typeof data?.message === 'string' && data.message.trim()) return data.message;
		if (typeof data?.error === 'string' && data.error.trim()) return data.error;
	} catch {
		return text.slice(0, 400);
	}
	return text.slice(0, 400);
};

const requestContext7 = async (options: {
	path: string;
	params: Record<string, string | undefined>;
	apiKey?: string;
	baseUrl?: string;
	timeoutMs?: number;
	parseAs?: 'json' | 'text';
}) => {
	const apiKey = ensureApiKey(options.apiKey);
	const baseUrl = normalizeBaseUrl(options.baseUrl);
	const timeoutMs = normalizeTimeout(options.timeoutMs);
	const parseAs = options.parseAs ?? 'json';

	const url = buildUrl(baseUrl, options.path, options.params);
	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
			signal: controller.signal,
		});

		if (!response.ok) {
			const message = await parseErrorMessage(response);
			throw new Context7Error(`Context7 请求失败 (${response.status}): ${message}`, {
				status: response.status,
				detail: { path: options.path },
			});
		}

		if (parseAs === 'text') {
			return await response.text();
		}
		return await response.json();
	} catch (error) {
		if (error instanceof Context7Error) {
			throw error;
		}
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new Context7Error(`Context7 请求超时（>${timeoutMs}ms）`, { code: 'timeout' });
		}
		throw new Context7Error(`Context7 请求异常: ${(error as Error)?.message || String(error)}`);
	} finally {
		window.clearTimeout(timer);
	}
};

const normalizeLibrary = (item: any): IContext7Library => {
	return {
		id: String(item?.id || ''),
		name: String(item?.name || item?.title || item?.id || ''),
		description: typeof item?.description === 'string' ? item.description : undefined,
		totalSnippets: typeof item?.totalSnippets === 'number' ? item.totalSnippets : undefined,
		trustScore: typeof item?.trustScore === 'number' ? item.trustScore : undefined,
		benchmarkScore: typeof item?.benchmarkScore === 'number' ? item.benchmarkScore : undefined,
		versions: Array.isArray(item?.versions) ? item.versions.map((v: any) => String(v)) : undefined,
	};
};

const normalizeContext = (payload: any): IContext7Snippet[] => {
	if (Array.isArray(payload)) {
		return payload
			.map((item: any) => ({
				title: String(item?.title || item?.pageTitle || item?.breadcrumb || 'Untitled'),
				content: String(item?.content || ''),
				source: item?.source || item?.pageId,
			}))
			.filter(item => item.content.trim() !== '');
	}

	const snippets: IContext7Snippet[] = [];
	const infoSnippets = Array.isArray(payload?.infoSnippets) ? payload.infoSnippets : [];
	const codeSnippets = Array.isArray(payload?.codeSnippets) ? payload.codeSnippets : [];

	for (const item of infoSnippets) {
		const content = String(item?.content || '').trim();
		if (!content) continue;
		snippets.push({
			title: String(item?.breadcrumb || 'Documentation'),
			content,
			source: item?.pageId,
		});
	}

	for (const item of codeSnippets) {
		const codes = Array.isArray(item?.codeList) ? item.codeList : [];
		const merged = codes.map((codeItem: any) => {
			const lang = String(codeItem?.language || '').trim();
			const code = String(codeItem?.code || '').trim();
			if (!code) return '';
			return `\`\`\`${lang}\n${code}\n\`\`\``;
		}).filter(Boolean).join('\n\n');

		if (!merged) continue;

		snippets.push({
			title: String(item?.codeTitle || item?.pageTitle || 'Code Snippet'),
			content: merged,
			source: item?.codeId,
		});
	}

	return snippets;
};

export const contextSnippetsToMarkdown = (snippets: IContext7Snippet[]) => {
	if (snippets.length === 0) return '未获取到相关文档内容。';

	return snippets
		.map((item, index) => {
			const sourceText = item.source ? `\n\n> 来源: ${item.source}` : '';
			return `## ${index + 1}. ${item.title}\n\n${item.content}${sourceText}`;
		})
		.join('\n\n---\n\n');
};

export const createContext7Sdk = (defaults?: IContext7RequestOptions) => {
	const getRequestOptions = (overrides?: IContext7RequestOptions): IContext7RequestOptions => {
		return {
			apiKey: overrides?.apiKey ?? defaults?.apiKey,
			baseUrl: overrides?.baseUrl ?? defaults?.baseUrl,
			timeoutMs: overrides?.timeoutMs ?? defaults?.timeoutMs,
		};
	};

	const searchLibraries = async (params: IContext7SearchParams): Promise<IContext7Library[]> => {
		const requestOptions = getRequestOptions(params);
		const payload = await requestContext7({
			path: '/libs/search',
			params: {
				libraryName: params.libraryName,
				query: params.query,
			},
			...requestOptions,
			parseAs: 'json',
		});

		const rows = Array.isArray(payload)
			? payload
			: Array.isArray((payload as any)?.results)
				? (payload as any).results
				: [];

		return rows.map(normalizeLibrary).filter(item => item.id && item.name);
	};

	const getContext = async (params: IContext7GetContextParams) => {
		const type = params.type === 'txt' ? 'txt' : 'json';
		const requestOptions = getRequestOptions(params);

		const payload = await requestContext7({
			path: '/context',
			params: {
				libraryId: params.libraryId,
				query: params.query,
				type,
			},
			...requestOptions,
			parseAs: type === 'txt' ? 'text' : 'json',
		});

		if (type === 'txt') {
			const text = String(payload || '');
			return {
				type,
				text,
				snippets: [{ title: 'Context', content: text }],
				raw: text,
			};
		}

		const snippets = normalizeContext(payload);
		return {
			type,
			text: contextSnippetsToMarkdown(snippets),
			snippets,
			raw: payload,
		};
	};

	return {
		searchLibraries,
		getContext,
		normalizeBaseUrl,
	};
};

