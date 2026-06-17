export type XmlVersionMode = 'current' | 'all';
export type XmlExportMode = 'reading' | 'programming';

export interface ChatXmlExportOptions {
    versionMode: XmlVersionMode;
    exportMode?: XmlExportMode;
    includeReasoning?: boolean;
    skipHidden?: boolean;
}

interface XmlChunk {
    node: Readonly<IChatSessionMsgItemV2>;
    payloads: Readonly<IMessagePayload>[];
}

export const safeXmlFilename = (title: string | undefined, fallback: string) => {
    const safeTitle = (title || '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '')
        .slice(0, 120);
    return `${safeTitle || fallback}.xml`;
};

export const chatHistoryToXml = (
    history: Readonly<IChatSessionHistoryV2>,
    options?: ChatXmlExportOptions
) => {
    const opts: ChatXmlExportOptions = {
        versionMode: options?.versionMode ?? 'current',
        exportMode: options?.exportMode ?? 'programming',
        includeReasoning: options?.includeReasoning === true,
        skipHidden: options?.skipHidden === true,
    };

    const isReading = opts.exportMode === 'reading';
    const nodes = extractWorldLineNodes(history, opts.skipHidden);
    const chunks = nodes.map(node => ({
        node,
        payloads: selectPayloads(node, opts.versionMode),
    }));
    const hasSystemPrompt = Boolean(history.sysPrompt?.trim());
    const chunkCount = chunks.length + (hasSystemPrompt ? 1 : 0);
    let chunkIdx = 0;

    const lines: string[] = [];
    lines.push(`<ChatHistory schema="1">`);

    if (!isReading) {
        lines.push(renderEmptyTag('Meta', {
            title: history.title,
            'session-id': history.id,
            'exported-at': new Date().toISOString(),
            mode: 'worldline',
            'version-mode': opts.versionMode,
            'chunk-count': chunkCount,
            'node-count': nodes.length,
        }));
    }

    lines.push(`<AgentGuide>`);
    lines.push(`Lossy export: optimized for structured reading, not restore. Raw JSON is the fidelity source.`);
    lines.push(`Scope: active worldline only; branch-count marks omitted sibling branches.`);
    lines.push(`Versions: nested Version blocks are alternative payloads of the same node, not chronological messages.`);
    lines.push(`Context: Context blocks are user-provided references merged into the prompt, not conversation turns.`);
    lines.push(`Media: Attachment blocks preserve metadata/source only; no fetching, decoding, or OCR was performed.`);
    lines.push(`</AgentGuide>`);

    if (!isReading) {
        lines.push(renderEmptyTag('Summary', buildSummaryAttrs(history, nodes, opts, chunkCount)));
    }

    if (hasSystemPrompt) {
        lines.push(renderBlock('Role-system', isReading
            ? { 'data-chunk-idx': chunkIdx++ }
            : { 'data-chunk-idx': chunkIdx++, source: 'session-sysPrompt' },
        [xmlText(history.sysPrompt ?? '')]));
    }

    for (const chunk of chunks) {
        lines.push(renderNodeChunk(chunk, chunkIdx++, opts));
    }

    lines.push(`</ChatHistory>`);
    return lines.join('\n');
};

const extractWorldLineNodes = (history: Readonly<IChatSessionHistoryV2>, skipHidden: boolean) => {
    return (history.worldLine || [])
        .map(id => history.nodes?.[id])
        .filter((node): node is IChatSessionMsgItemV2 => Boolean(node))
        .filter(node => !(skipHidden && node.hidden === true));
};

const selectPayloads = (node: Readonly<IChatSessionMsgItemV2>, versionMode: XmlVersionMode) => {
    const versions = node.versions || {};
    if (versionMode === 'all') {
        return Object.values(versions).filter(Boolean);
    }
    const current = versions[node.currentVersionId];
    return current ? [current] : [];
};

const renderNodeChunk = (chunk: XmlChunk, chunkIdx: number, options: ChatXmlExportOptions) => {
    const { node, payloads } = chunk;
    const isReading = options.exportMode === 'reading';

    if (node.type === 'separator') {
        return renderEmptyTag('Separator', isReading
            ? { 'data-chunk-idx': chunkIdx }
            : { 'data-chunk-idx': chunkIdx, 'node-id': node.id });
    }

    const role = sanitizeTagName(node.role || 'unknown');
    const tagName = `Role-${role}`;

    if (isReading) {
        const readingAttrs: Record<string, string | number | boolean | undefined> = {
            'data-chunk-idx': chunkIdx,
        };

        if (options.versionMode === 'all') {
            return renderBlock(tagName, readingAttrs, [
                ...payloads.map((payload, idx) =>
                    renderPayloadVersionReading(payload, idx, payload.id === node.currentVersionId, options.includeReasoning === true)),
            ]);
        }

        const payload = payloads[0];
        return renderBlock(tagName, readingAttrs, renderPayloadContent(payload, options.includeReasoning === true));
    }

    // Programming mode (original)
    const attrs: Record<string, string | number | boolean | undefined> = {
        'data-chunk-idx': chunkIdx,
        'node-id': node.id,
        role: node.role || undefined,
        'version-id': options.versionMode === 'current' ? node.currentVersionId : undefined,
        'version-count': Object.keys(node.versions || {}).length || undefined,
        'branch-count': node.children?.length ?? 0,
        hidden: node.hidden === true ? true : undefined,
        pinned: node.pinned === true ? true : undefined,
    };

    if (options.versionMode === 'all') {
        return renderBlock(tagName, attrs, [
            ...renderNodeContext(node),
            ...payloads.map(payload => renderPayloadVersion(node, payload, options.includeReasoning === true)),
        ]);
    }

    const payload = payloads[0];
    const body = [
        ...renderNodeContext(node),
        ...renderPayloadContent(payload, options.includeReasoning === true),
    ];
    if (payload?.author) attrs.author = payload.author;
    if (payload?.timestamp) attrs.timestamp = new Date(payload.timestamp).toISOString();
    return renderBlock(tagName, attrs, body);
};

const renderPayloadVersion = (
    node: Readonly<IChatSessionMsgItemV2>,
    payload: Readonly<IMessagePayload>,
    includeReasoning: boolean
) => {
    return renderBlock('Version', {
        id: payload.id,
        current: payload.id === node.currentVersionId,
        author: payload.author,
        timestamp: payload.timestamp ? new Date(payload.timestamp).toISOString() : undefined,
    }, renderPayloadContent(payload, includeReasoning));
};

const renderPayloadVersionReading = (
    payload: Readonly<IMessagePayload>,
    index: number,
    isCurrent: boolean,
    includeReasoning: boolean
) => {
    return renderBlock('Version', {
        idx: index + 1,
        current: isCurrent ? true : undefined,
    }, renderPayloadContent(payload, includeReasoning));
};

const renderNodeContext = (node: Readonly<IChatSessionMsgItemV2>) => {
    const contexts = node.context || [];
    return contexts.map(context => {
        const items = (context.contextItems || []).map(item => renderBlock('ContextItem', {
            name: item.name,
            description: item.description,
        }, [xmlText(item.content || '')]));
        return renderBlock('Context', {
            source: context.name,
            title: context.displayTitle,
            description: context.description,
        }, items);
    });
};

const renderPayloadContent = (payload: Readonly<IMessagePayload> | undefined, includeReasoning: boolean) => {
    if (!payload?.message) return [];
    const body: string[] = [];
    if (includeReasoning && payload.message.reasoning_content) {
        body.push(renderBlock('Reasoning', {}, [xmlText(payload.message.reasoning_content)]));
    }
    body.push(...renderMessageContent(payload.message.content));
    if (payload.message.tool_calls?.length) {
        body.push(renderBlock('ToolCalls', {}, [xmlText(JSON.stringify(payload.message.tool_calls))]));
    }
    if (payload.toolChainResult) {
        body.push(renderBlock('ToolChain', {}, [xmlText(JSON.stringify(payload.toolChainResult))]));
    }
    return body;
};

const renderMessageContent = (content: TMessageContent | string | null | undefined) => {
    if (!content) return [];
    if (typeof content === 'string') return [xmlText(content)];

    const body: string[] = [];
    for (const part of content) {
        if (part.type === 'text') {
            body.push(xmlText(part.text));
        } else if (part.type === 'image_url') {
            body.push(renderEmptyTag('Attachment', {
                type: 'image',
                source: part.image_url.url,
                detail: part.image_url.detail,
            }));
        } else if (part.type === 'input_audio') {
            body.push(renderEmptyTag('Attachment', {
                type: 'audio',
                format: part.input_audio.format,
                'data-length': part.input_audio.data?.length ?? 0,
            }));
        } else if (part.type === 'file') {
            body.push(renderEmptyTag('Attachment', {
                type: 'file',
                filename: part.file.filename,
                'file-id': part.file.file_id,
                'data-length': part.file.file_data?.length ?? 0,
            }));
        }
    }
    return body;
};

const buildSummaryAttrs = (
    history: Readonly<IChatSessionHistoryV2>,
    nodes: Readonly<IChatSessionMsgItemV2>[],
    options: ChatXmlExportOptions,
    chunkCount: number
) => {
    const allWorldLineNodes = extractWorldLineNodes(history, false);
    return {
        mode: 'worldline',
        'version-mode': options.versionMode,
        'chunk-count': chunkCount,
        'message-count': nodes.filter(node => node.type === 'message').length,
        'separator-count': nodes.filter(node => node.type === 'separator').length,
        'branch-nodes': nodes.filter(node => (node.children?.length ?? 0) > 1).length,
        'multi-version-nodes': nodes.filter(node => Object.keys(node.versions || {}).length > 1).length,
        'context-nodes': nodes.filter(node => (node.context?.length ?? 0) > 0).length,
        'media-nodes': nodes.filter(hasMedia).length,
        'hidden-skipped': allWorldLineNodes.length - nodes.length,
        'reasoning-included': options.includeReasoning === true,
    };
};

const hasMedia = (node: Readonly<IChatSessionMsgItemV2>) => {
    return Object.values(node.versions || {}).some(payload => {
        const content = payload.message?.content;
        return Array.isArray(content) && content.some(part => part.type !== 'text');
    });
};

const renderBlock = (
    tagName: string,
    attrs: Record<string, string | number | boolean | undefined>,
    body: Array<string | undefined>
) => {
    return [
        `<${tagName}${renderAttrs(attrs)}>`,
        ...body.filter((line): line is string => line !== undefined && line !== ''),
        `</${tagName}>`,
    ].join('\n');
};

const renderEmptyTag = (tagName: string, attrs: Record<string, string | number | boolean | undefined>) => {
    return `<${tagName}${renderAttrs(attrs)} />`;
};

const renderAttrs = (attrs: Record<string, string | number | boolean | undefined>) => {
    const rendered = Object.entries(attrs)
        .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
        .map(([key, value]) => `${key}="${escapeXmlAttr(String(value))}"`);
    return rendered.length > 0 ? ` ${rendered.join(' ')}` : '';
};

const xmlText = (text: string) => escapeXmlText(text);

const escapeXmlText = (text: string) => {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
};

const escapeXmlAttr = (text: string) => {
    return escapeXmlText(text).replaceAll('"', '&quot;');
};

const sanitizeTagName = (role: string) => {
    return role.replace(/[^A-Za-z0-9_.-]/g, '-');
};
