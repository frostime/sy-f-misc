interface IGeminiPartText {
    text: string;
    /** 标记该 part 为模型的思考过程文本；展示时应归入 reasoning 而非正文 */
    thought?: boolean;
    /** 思考内容的 opaque base64 签名；不可读，忽略 */
    thoughtSignature?: string;
}

interface IGeminiPartFunctionCall {
    functionCall: {
        name: string;
        args?: Record<string, any>;
    };
}

interface IGeminiPartFunctionResponse {
    functionResponse: {
        name: string;
        response?: Record<string, any>;
    };
}

interface IGeminiPartInlineData {
    inlineData: {
        mimeType: string;
        data: string;  // base64-encoded bytes
    };
}

type IGeminiPart = IGeminiPartText | IGeminiPartFunctionCall | IGeminiPartFunctionResponse | IGeminiPartInlineData;

interface IGeminiContent {
    role: 'user' | 'model';
    parts: IGeminiPart[];
}

interface IGeminiCandidate {
    content?: IGeminiContent;
    finishReason?: string;
    safetyRatings?: Array<{
        category: string;
        probability?: string;
        blocked?: boolean;
    }>;
}

interface IGeminiResponse {
    candidates?: IGeminiCandidate[];
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
        /** promptTokenCount 的子集 */
        cachedContentTokenCount?: number;
        /** 思考 token；不在 candidatesTokenCount 内，但计入 totalTokenCount */
        thoughtsTokenCount?: number;
        toolUsePromptTokenCount?: number;
    };
    promptFeedback?: Record<string, any>;
}
