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
}

type ClaudeContentBlock = IClaudeContentText | IClaudeContentToolUse | IClaudeContentToolResult | IClaudeContentThinking;

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
    };
}
