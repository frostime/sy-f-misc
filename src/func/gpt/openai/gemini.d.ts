interface IGeminiPartText {
    text: string;
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
    };
    promptFeedback?: Record<string, any>;
}
