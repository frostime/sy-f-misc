interface IClaudeContentText {
    type: 'text';
    text: string;
}

interface IClaudeContentToolUse {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, any>;
}

interface IClaudeContentToolResult {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

interface IClaudeContentThinking {
    type: 'thinking';
    thinking: string;
    /** 可读思维链的防篡改签名；不可读，仅透传回 API 用，展示时忽略 */
    signature?: string;
}

/** 官方语义：data 为不可读的加密思维内容，不得展示或 stringify */
interface IClaudeContentRedactedThinking {
    type: 'redacted_thinking';
    data: string;
}

type ClaudeContentBlock = IClaudeContentText | IClaudeContentToolUse | IClaudeContentToolResult | IClaudeContentThinking | IClaudeContentRedactedThinking;

interface IClaudeMessage {
    role: 'user' | 'assistant';
    content: ClaudeContentBlock[];
}

interface IClaudeTool {
    name: string;
    description?: string;
    input_schema: {
        type: 'object';
        properties?: Record<string, any>;
        required?: string[];
        additionalProperties?: boolean;
    };
}

interface IClaudeResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: ClaudeContentBlock[];
    stop_reason?: string;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        /** 相加语义：total input = input_tokens + cache_read + cache_creation（官方 SDK 注释） */
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
        output_tokens_details?: {
            /** ≤ output_tokens 的内部推理 token（output 的子集） */
            thinking_tokens?: number;
        } | null;
    };
}
