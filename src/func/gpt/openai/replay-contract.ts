/**
 * Canonical message <-> provider native replay contract.
 *
 * Canonical owners:
 * - `content` owns visible body text.
 * - `tool_calls` owns tool names and normalized arguments.
 * - `reasoning_content` owns displayed reasoning and is never rewritten by edits.
 *
 * Replay metadata owns only what cannot be rebuilt from those fields: signatures, encrypted or
 * redacted payloads, native ids, unknown fields, and block/part ordering. Capture is deliberately
 * conservative: when a faithful narrow record cannot be produced without copying body text or call
 * arguments, it returns `undefined` and the message falls back to canonical conversion.
 *
 * Legacy full-native `extra` (`{ protocol, data }`) is read-only and replayed verbatim. Editing a
 * message removes its replay metadata, so a legacy copy can never override edited content.
 */
import { getCompatibleExtra } from './protocol-extra';

type NarrowClaudeReplay = Extract<IMessageExtra, { protocol: 'claude'; v: 2 }>;
type NarrowGeminiReplay = Extract<IMessageExtra, { protocol: 'gemini'; v: 2 }>;

/** Tool-call facts needed later by `functionResponse` (name and native id). */
export interface ReplayCallMapping {
    toolCallId: string;
    name: string;
    /** Present only when the provider actually sent an id; synthetic ids are never sent back. */
    serverId?: string;
}

const BODY_OR_ARGS_KEYS = ['text', 'thinking', 'input', 'content', 'args', 'functionCall', 'functionResponse'];

const isRecord = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const clone = <T>(value: T): T => structuredClone(value);

const hasUnknownKeys = (value: Record<string, any>, allowed: readonly string[]): boolean =>
    Object.keys(value).some(key => !allowed.includes(key));

const hasBodyOrArgs = (value: Record<string, any>): boolean =>
    BODY_OR_ARGS_KEYS.some(key => key in value);

/** Same contract as `protocol-utils.messageContentToText`, kept local to stay dependency-free. */
const messageText = (content: IMessage['content']): string => {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .filter(part => part?.type === 'text')
        .map(part => (part as ITextContentPart).text || '')
        .join('\n');
};

const assistantCalls = (message: IMessage): IToolCall[] =>
    message.role === 'assistant' && Array.isArray(message.tool_calls) ? message.tool_calls : [];

const assistantReasoning = (message: IMessage): string =>
    message.role === 'assistant' && typeof message.reasoning_content === 'string' ? message.reasoning_content : '';

const parseArguments = (raw: string | undefined): Record<string, any> => {
    try {
        const parsed = JSON.parse(raw || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

// ============================================================================
// Claude
// ============================================================================

const needsClaudeReplay = (slots: ClaudeReplaySlot[]): boolean =>
    slots.some(slot => slot.kind === 'opaque'
        || (slot.kind === 'thinking' && slot.signature !== undefined));

/**
 * Capture narrow Claude replay from native content blocks.
 *
 * Body text (`text`), call arguments (`tool_use.input`) and reasoning text all stay in canonical
 * fields; thinking blocks are referenced by length inside `reasoning_content`. When those native
 * segments do not equal `reasoning` exactly, capture declines instead of writing a record that
 * cannot be rebuilt.
 */
export const captureClaudeReplay = (blocks: unknown, reasoning?: string): IMessageExtra | undefined => {
    if (!Array.isArray(blocks)) return undefined;

    const slots: ClaudeReplaySlot[] = [];
    let textSlots = 0;
    let reasoningText = '';

    for (const block of blocks) {
        if (!isRecord(block) || typeof block.type !== 'string') return undefined;

        if (block.type === 'text') {
            if (hasUnknownKeys(block, ['type', 'text'])) return undefined;
            textSlots++;
            slots.push({ kind: 'text' });
            continue;
        }

        if (block.type === 'thinking') {
            if (hasUnknownKeys(block, ['type', 'thinking', 'signature'])) return undefined;
            const text = typeof block.thinking === 'string' ? block.thinking : '';
            reasoningText += text;
            slots.push({
                kind: 'thinking',
                chars: text.length,
                ...(typeof block.signature === 'string' ? { signature: block.signature } : {}),
            });
            continue;
        }

        if (block.type === 'tool_use') {
            if (typeof block.id !== 'string' || !block.id) return undefined;
            if (hasUnknownKeys(block, ['type', 'id', 'name', 'input'])) return undefined;
            slots.push({ kind: 'tool_use', id: block.id });
            continue;
        }

        // redacted_thinking and unknown kinds: keep verbatim only when they cannot carry body
        // text, reasoning text or call arguments.
        if (hasBodyOrArgs(block)) return undefined;
        slots.push({ kind: 'opaque', block: clone(block) });
    }

    // One canonical `content` string cannot recover boundaries between several text blocks.
    if (textSlots > 1) return undefined;
    // Reasoning text must be reproducible from `reasoning_content` alone.
    if (reasoningText !== (reasoning ?? '')) return undefined;
    return needsClaudeReplay(slots) ? { protocol: 'claude', v: 2, slots } : undefined;
};

const buildClaudeBlocks = (message: IMessage, replay: NarrowClaudeReplay): ClaudeContentBlock[] | undefined => {
    const text = messageText(message.content);
    const reasoning = assistantReasoning(message);
    const calls = assistantCalls(message);
    const hasTextSlot = replay.slots.some(slot => slot.kind === 'text');
    const firstCall = replay.slots.findIndex(slot => slot.kind === 'tool_use');
    // A body edited into a turn that originally had no text block is placed before the calls.
    const textAnchor = hasTextSlot ? -1 : (firstCall < 0 ? replay.slots.length : firstCall);

    const blocks: ClaudeContentBlock[] = [];
    let textEmitted = false;
    let reasoningCursor = 0;

    const emitText = () => {
        textEmitted = true;
        if (text.trim()) blocks.push({ type: 'text', text } as ClaudeContentBlock);
    };

    for (let index = 0; index <= replay.slots.length; index++) {
        if (!hasTextSlot && !textEmitted && index === textAnchor) emitText();
        if (index === replay.slots.length) break;

        const slot = replay.slots[index];
        if (slot.kind === 'text') {
            if (!textEmitted) emitText();
            continue;
        }
        if (slot.kind === 'thinking') {
            const chunk = reasoning.slice(reasoningCursor, reasoningCursor + slot.chars);
            if (chunk.length !== slot.chars) return undefined;
            reasoningCursor += slot.chars;
            blocks.push({
                type: 'thinking',
                thinking: chunk,
                ...(slot.signature !== undefined ? { signature: slot.signature } : {}),
            } as ClaudeContentBlock);
            continue;
        }
        if (slot.kind === 'opaque') {
            blocks.push(clone(slot.block) as ClaudeContentBlock);
            continue;
        }

        // Claude always records a native id, so the canonical call must match exactly;
        // anything else falls back to canonical conversion instead of guessing.
        const call = calls.find(item => item.id === slot.id);
        if (!call) return undefined;
        blocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.function.name,
            input: parseArguments(call.function.arguments),
        } as ClaudeContentBlock);
    }

    if (reasoningCursor !== reasoning.length) return undefined;
    return blocks;
};

/** Native blocks for one assistant message, or `undefined` to use canonical conversion. */
export const prepareClaudeReplayBlocks = (
    message: IMessage,
    runtime: IRuntimeLLM,
): ClaudeContentBlock[] | undefined => {
    const extra = getCompatibleExtra(message, runtime);
    if (extra?.protocol !== 'claude') return undefined;
    // Legacy full-native record for an untouched message: replay exactly what was produced.
    if (!('slots' in extra)) return clone(extra.data.content);
    return buildClaudeBlocks(message, extra);
};


// ============================================================================
// Gemini
// ============================================================================

const needsGeminiReplay = (slots: GeminiReplaySlot[]): boolean =>
    slots.some(slot => {
        if (slot.kind === 'opaque' || slot.kind === 'empty_signed_text') return true;
        if (slot.kind === 'text') return slot.signature !== undefined;
        if (slot.kind === 'thought') return slot.signature !== undefined;
        return slot.signature !== undefined || slot.id !== undefined;
    });

/**
 * Capture narrow Gemini replay from native parts.
 *
 * Streamed bodies arrive as one part per chunk. Fragments are merged into a single text slot that
 * is rebuilt from `content`. A `thoughtSignature` is kept only when the body was delivered as a
 * single part, because moving a signature onto merged fragments is not verified against a live
 * provider; otherwise capture declines to write replay metadata. Thought text stays in
 * `reasoning_content` and is referenced by length.
 */
export const captureGeminiReplay = (parts: unknown, reasoning?: string): IMessageExtra | undefined => {
    if (!Array.isArray(parts)) return undefined;

    const slots: GeminiReplaySlot[] = [];
    let textSlots = 0;
    let reasoningText = '';
    let pendingText: { parts: number; signature?: string; unsafe: boolean } | undefined;

    const flushText = (): boolean => {
        if (!pendingText) return true;
        const { parts: partCount, signature, unsafe } = pendingText;
        pendingText = undefined;
        if (unsafe) return false;
        if (signature !== undefined && partCount > 1) return false;
        slots.push(signature === undefined ? { kind: 'text' } : { kind: 'text', signature });
        textSlots++;
        return true;
    };

    for (const part of parts) {
        if (!isRecord(part)) return undefined;

        if (typeof part.text === 'string') {
            if (part.thought === true) {
                if (!flushText()) return undefined;
                if (hasUnknownKeys(part, ['text', 'thought', 'thoughtSignature'])) return undefined;
                reasoningText += part.text;
                slots.push({
                    kind: 'thought',
                    chars: part.text.length,
                    ...(typeof part.thoughtSignature === 'string' ? { signature: part.thoughtSignature } : {}),
                });
                continue;
            }
            if (hasUnknownKeys(part, ['text', 'thoughtSignature'])) return undefined;

            const signature = typeof part.thoughtSignature === 'string' ? part.thoughtSignature : undefined;
            if (!part.text) {
                // Signature-only part: no canonical field can reproduce it.
                if (!flushText()) return undefined;
                if (signature !== undefined) {
                    slots.push({ kind: 'empty_signed_text', part: clone(part) as IGeminiPart });
                }
                continue;
            }

            pendingText ??= { parts: 0, unsafe: false };
            pendingText.parts++;
            if (signature !== undefined) {
                if (pendingText.signature !== undefined && pendingText.signature !== signature) {
                    pendingText.unsafe = true;
                }
                pendingText.signature = signature;
            }
            continue;
        }

        if (!flushText()) return undefined;

        const functionCall = part.functionCall;
        if (isRecord(functionCall) && typeof functionCall.name === 'string') {
            if (hasUnknownKeys(part, ['functionCall', 'thoughtSignature'])) return undefined;
            if (hasUnknownKeys(functionCall, ['name', 'args', 'id'])) return undefined;
            slots.push({
                kind: 'function_call',
                ...(typeof functionCall.id === 'string' && functionCall.id ? { id: functionCall.id } : {}),
                ...(typeof part.thoughtSignature === 'string' ? { signature: part.thoughtSignature } : {}),
            });
            continue;
        }

        // Unknown kinds: keep verbatim only when they cannot carry body text or call arguments.
        if (hasBodyOrArgs(part)) return undefined;
        slots.push({ kind: 'opaque', part: clone(part) as IGeminiPart });
    }

    if (!flushText()) return undefined;
    if (textSlots > 1) return undefined;
    // Thought text must be reproducible from `reasoning_content` alone.
    if (reasoningText !== (reasoning ?? '')) return undefined;
    return needsGeminiReplay(slots) ? { protocol: 'gemini', v: 2, slots } : undefined;
};

const buildGeminiParts = (
    message: IMessage,
    replay: NarrowGeminiReplay,
): { parts: IGeminiPart[]; calls: ReplayCallMapping[] } | undefined => {
    const text = messageText(message.content);
    const reasoning = assistantReasoning(message);
    const calls = assistantCalls(message);
    const usedCalls = new Set<string>();
    // Calls referenced by a native id must not be re-consumed by a positional lookup.
    const reservedCalls = new Set<string>();
    for (const slot of replay.slots) {
        if (slot.kind === 'function_call' && slot.id !== undefined) reservedCalls.add(slot.id);
    }
    const hasTextSlot = replay.slots.some(slot => slot.kind === 'text');
    const firstCall = replay.slots.findIndex(slot => slot.kind === 'function_call');
    const textAnchor = hasTextSlot ? -1 : (firstCall < 0 ? replay.slots.length : firstCall);

    const parts: IGeminiPart[] = [];
    const mappings: ReplayCallMapping[] = [];
    let textEmitted = false;
    let reasoningCursor = 0;

    const emitText = () => {
        textEmitted = true;
        if (text.trim()) parts.push({ text } as IGeminiPart);
    };

    for (let index = 0; index <= replay.slots.length; index++) {
        if (!hasTextSlot && !textEmitted && index === textAnchor) emitText();
        if (index === replay.slots.length) break;

        const slot = replay.slots[index];
        if (slot.kind === 'text') {
            if (textEmitted) continue;
            textEmitted = true;
            if (text.trim()) {
                parts.push({
                    text,
                    ...(slot.signature !== undefined ? { thoughtSignature: slot.signature } : {}),
                } as IGeminiPart);
            }
            continue;
        }
        if (slot.kind === 'thought') {
            const chunk = reasoning.slice(reasoningCursor, reasoningCursor + slot.chars);
            if (chunk.length !== slot.chars) return undefined;
            reasoningCursor += slot.chars;
            parts.push({
                text: chunk,
                thought: true,
                ...(slot.signature !== undefined ? { thoughtSignature: slot.signature } : {}),
            } as IGeminiPart);
            continue;
        }
        if (slot.kind === 'opaque' || slot.kind === 'empty_signed_text') {
            parts.push(clone(slot.part));
            continue;
        }

        // With a native id the match must be exact and single-use; without one, bind the first
        // call that no native-id slot reserved and that was not consumed yet.
        const call = slot.id !== undefined
            ? calls.find(item => item.id === slot.id && !usedCalls.has(item.id))
            : calls.find(item => !usedCalls.has(item.id) && !reservedCalls.has(item.id))
                ?? calls.find(item => !usedCalls.has(item.id));
        if (!call) return undefined;
        usedCalls.add(call.id);
        parts.push({
            functionCall: {
                ...(slot.id !== undefined ? { id: slot.id } : {}),
                name: call.function.name,
                args: parseArguments(call.function.arguments),
            },
            ...(slot.signature !== undefined ? { thoughtSignature: slot.signature } : {}),
        } as IGeminiPart);
        mappings.push({
            toolCallId: call.id,
            name: call.function.name,
            ...(slot.id !== undefined ? { serverId: slot.id } : {}),
        });
    }

    if (reasoningCursor !== reasoning.length) return undefined;
    return { parts, calls: mappings };
};

/** Legacy full-native record: replay verbatim and derive call facts by position. */
const mapLegacyGeminiCalls = (message: IMessage, parts: IGeminiPart[]): ReplayCallMapping[] => {
    const calls = assistantCalls(message);
    const mappings: ReplayCallMapping[] = [];
    let index = 0;

    for (const part of parts) {
        const functionCall = (part as IGeminiPartFunctionCall)?.functionCall;
        if (!functionCall?.name) continue;
        const normalized = calls[index++];
        const toolCallId = normalized?.id ?? functionCall.id;
        if (!toolCallId) continue;
        mappings.push({ toolCallId, name: functionCall.name, serverId: functionCall.id });
    }

    return mappings;
};

/** Native parts for one assistant message, or `undefined` to use canonical conversion. */
export const prepareGeminiReplayParts = (
    message: IMessage,
    runtime: IRuntimeLLM,
): { parts: IGeminiPart[]; calls: ReplayCallMapping[] } | undefined => {
    const extra = getCompatibleExtra(message, runtime);
    if (extra?.protocol !== 'gemini') return undefined;
    if (!('slots' in extra)) {
        return { parts: clone(extra.data.parts), calls: mapLegacyGeminiCalls(message, extra.data.parts) };
    }
    return buildGeminiParts(message, extra);
};

// ============================================================================
// Edit invalidation
// ============================================================================

/**
 * Remove replay metadata from a message whose editable body was just rewritten.
 * Narrow records would rebuild from the new body anyway; legacy full records must be dropped so
 * their stale body copy cannot override the edit. Other versions are untouched.
 */
export const stripReplayMetadata = <T extends object>(message: T): T => {
    if (!('extra' in message)) return message;
    const { extra: _dropped, ...rest } = message as T & { extra?: IMessageExtra };
    return rest as T;
};
