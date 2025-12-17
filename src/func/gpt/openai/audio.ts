import { appendLog } from "../MessageLogger";
import { FormatConverter, formatFileSize } from "../chat-utils/msg-modal";

// ============================================================================
// Audio Transcription Types (Speech-to-Text)
// ============================================================================

export interface IAudioTranscriptionOptions {
    file: File | Blob;
    model: string;
    language?: string;
    prompt?: string;
    response_format?: "json" | "text" | "srt" | "verbose_json" | "vtt";
    temperature?: number;
    timestamp_granularities?: ("word" | "segment")[];
    [key: string]: any;
}

export interface IAudioTranscriptionResult {
    ok?: boolean;
    text?: string;
    language?: string;
    duration?: number;
    words?: Array<{
        word: string;
        start: number;
        end: number;
    }>;
    segments?: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
    }>;
    error?: string;
}

// ============================================================================
// Text-to-Speech Types
// ============================================================================

export interface ITextToSpeechOptions {
    input: string;
    model?: string;
    voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
    response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
    speed?: number;
    [key: string]: any;
}

export interface ITextToSpeechResult {
    ok?: boolean;
    audio?: Blob;
    audioUrl?: string;
    error?: string;
    format?: string;
    duration?: number;
}

// ============================================================================
// Audio Transcription Implementation (Speech-to-Text)
// ============================================================================

/**
 * Transcribe audio to text using Whisper
 * @param runtimeModel - Runtime LLM configuration
 * @param options - Audio transcription options
 * @returns Promise with transcription result
 */
export const transcribeAudio = async (
    runtimeModel: IRuntimeLLM,
    options: IAudioTranscriptionOptions
): Promise<IAudioTranscriptionResult> => {
    if (!runtimeModel) {
        return {
            ok: false,
            error: 'Error: 无法获取音频转录模型，请先在设置中添加并选择一个模型。'
        };
    }

    try {
        const { url, apiKey, provider } = runtimeModel;

        const knownParams = ['file', 'model', 'language', 'prompt', 'response_format', 'temperature', 'timestamp_granularities'];

        // Get the endpoint for audio transcriptions
        // const endpoint = provider?.endpoints?.audio_transcriptions || '/audio/transcriptions';
        // const fullUrl = url.endsWith(endpoint) ? url : `${url}${endpoint}`;
        const fullUrl = url;

        // Build FormData for multipart/form-data request
        const formData = new FormData();
        formData.append('file', options.file);
        formData.append('model', runtimeModel.model);

        if (options.language) formData.append('language', options.language);
        if (options.prompt) formData.append('prompt', options.prompt);
        if (options.response_format) formData.append('response_format', options.response_format);
        if (options.temperature !== undefined) formData.append('temperature', options.temperature.toString());
        if (options.timestamp_granularities) {
            options.timestamp_granularities.forEach(granularity => {
                formData.append('timestamp_granularities[]', granularity);
            });
        }

        // Add custom parameters
        Object.keys(options).forEach(key => {
            if (!knownParams.includes(key)) {
                console.log(`[Audio Transcription] Custom parameter passed: ${key}`, options[key]);
                formData.append(key, options[key]);
            }
        });

        appendLog({
            type: 'request', data: {
                hasAudioFile: true,
                model: options.model,
                language: options.language,
                response_format: options.response_format
            }
        });

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...(provider?.customHeaders || {})
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            appendLog({ type: 'response', data: errorData });
            return {
                ok: false,
                error: errorData ? JSON.stringify(errorData) : `HTTP error! status: ${response.status}`
            };
        }

        // Handle different response formats
        const responseFormat = options.response_format || 'json';
        let result: IAudioTranscriptionResult;

        if (responseFormat === 'text') {
            const text = await response.text();
            result = {
                ok: true,
                text: text
            };
        } else if (responseFormat === 'verbose_json') {
            const data = await response.json();
            result = {
                ok: true,
                text: data.text,
                language: data.language,
                duration: data.duration,
                words: data.words,
                segments: data.segments?.map((seg: any) => ({
                    id: seg.id,
                    start: seg.start,
                    end: seg.end,
                    text: seg.text
                }))
            };
        } else if (responseFormat === 'srt' || responseFormat === 'vtt') {
            const text = await response.text();
            result = {
                ok: true,
                text: text
            };
        } else {
            const data = await response.json();
            result = {
                ok: true,
                text: data.text
            };
        }

        appendLog({ type: 'response', data: result });
        return result;

    } catch (error) {
        return {
            ok: false,
            error: `Failed to transcribe audio: ${error}`
        };
    }
};

// ============================================================================
// Text-to-Speech Implementation
// ============================================================================

/**
 * Generate speech from text using TTS
 * @param runtimeModel - Runtime LLM configuration
 * @param options - Text-to-speech options
 * @returns Promise with audio result
 */
export const textToSpeech = async (
    runtimeModel: IRuntimeLLM,
    options: ITextToSpeechOptions
): Promise<ITextToSpeechResult> => {
    if (!runtimeModel) {
        return {
            ok: false,
            error: 'Error: 无法获取语音合成模型，请先在设置中添加并选择一个模型。'
        };
    }

    try {
        const { url: fullUrl, apiKey, provider } = runtimeModel;

        const knownParams = ['input', 'model', 'voice', 'response_format', 'speed'];

        // Get the endpoint for audio speech
        // const endpoint = provider?.endpoints?.audio_speech || '/audio/speech';
        // const fullUrl = url.endsWith(endpoint) ? url : `${url}${endpoint}`;

        // Build request payload
        const payload: any = {
            input: options.input,
            model: runtimeModel.model,
            voice: options.voice,
        };

        if (options.response_format) payload.response_format = options.response_format;
        if (options.speed !== undefined) payload.speed = options.speed;

        // Add custom parameters
        Object.keys(options).forEach(key => {
            if (!knownParams.includes(key)) {
                console.log(`[Text To Speech] Custom parameter passed: ${key}`, options[key]);
                payload[key] = options[key];
            }
        });

        appendLog({ type: 'request', data: payload });

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...(provider?.customHeaders || {})
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            appendLog({ type: 'response', data: errorData });
            return {
                ok: false,
                error: errorData ? JSON.stringify(errorData) : `HTTP error! status: ${response.status}`
            };
        }

        // Get audio as Blob
        const audioBlob = await response.blob();

        // 使用 Blob URL 而不是 DataURL，避免占用大量文本空间
        // 设置 10 分钟后自动回收，给用户足够时间播放和下载，避免长期占用内存
        const audioBlobURL = FormatConverter.blobToObjectURL(audioBlob, {
            seconds: 6000
        });

        appendLog({ type: 'response', data: { audioGenerated: true, size: audioBlob.size } });

        return {
            ok: true,
            audio: audioBlob,
            audioUrl: audioBlobURL, // 使用 Blob URL（轻量级）
            format: options.response_format || 'mp3'
        };

    } catch (error) {
        return {
            ok: false,
            error: `Failed to generate speech: ${error}`
        };
    }
};

// ============================================================================
// Conversion to ICompletionResult
// ============================================================================

/**
 * Convert IAudioTranscriptionResult to ICompletionResult for display in chat
 * @param transcriptionResult - Audio transcription result
 * @param options - Conversion options
 * @returns ICompletionResult with transcribed text and timestamps
 */
export const transcriptionResultToCompletion = (
    transcriptionResult: IAudioTranscriptionResult,
    options?: {
        showTimestamps?: boolean;
        showSegments?: boolean;
    }
): ICompletionResult => {
    if (!transcriptionResult.ok) {
        return {
            ok: false,
            content: `**音频转录失败**\n\n${transcriptionResult.error}`,
            usage: null
        };
    }

    const lines: string[] = [];

    // Add metadata
    const metadata: string[] = [];
    if (transcriptionResult.language) metadata.push(`语言: ${transcriptionResult.language}`);
    if (transcriptionResult.duration) {
        const minutes = Math.floor(transcriptionResult.duration / 60);
        const seconds = Math.floor(transcriptionResult.duration % 60);
        metadata.push(`时长: ${minutes}:${seconds.toString().padStart(2, '0')}`);
    }

    if (metadata.length > 0) {
        lines.push(`*${metadata.join(' | ')}*\n`);
    }

    // Add transcribed text - 使用折叠处理长文本
    const text = transcriptionResult.text || '';
    const MAX_PREVIEW_LENGTH = 200;

    lines.push(`### 转录文本\n`);

    if (text.length <= MAX_PREVIEW_LENGTH) {
        // 短文本直接显示
        lines.push(text);
    } else {
        // 长文本使用 details 折叠
        const preview = text.substring(0, MAX_PREVIEW_LENGTH);
        lines.push(`${preview}...`);
        lines.push(`\n<details><summary>📄 展开完整文本 (${text.length} 字符)</summary>\n`);
        lines.push('```txt');
        lines.push(text);
        lines.push('```');
        lines.push('</details>');
    }

    // Add timestamps if requested and available
    if (options?.showTimestamps && transcriptionResult.words && transcriptionResult.words.length > 0) {
        lines.push(`\n### 词级时间戳\n`);
        lines.push('<details><summary>📊 展开查看时间戳</summary>\n');
        transcriptionResult.words.forEach(word => {
            const start = word.start.toFixed(2);
            const end = word.end.toFixed(2);
            lines.push(`- **${word.word}** \`[${start}s - ${end}s]\``);
        });
        lines.push('</details>');
    }

    // Add segments if requested and available
    if (options?.showSegments && transcriptionResult.segments && transcriptionResult.segments.length > 0) {
        lines.push(`\n### 段落分段\n`);
        lines.push('<details><summary>📑 展开查看分段</summary>\n');
        transcriptionResult.segments.forEach(segment => {
            const start = segment.start.toFixed(2);
            const end = segment.end.toFixed(2);
            lines.push(`\n**段落 ${segment.id}** \`[${start}s - ${end}s]\`\n`);
            lines.push(`${segment.text}\n`);
        });
        lines.push('</details>');
    }

    return {
        ok: true,
        content: lines.join('\n'),
        usage: null
    };
};

/**
 * Convert ITextToSpeechResult to ICompletionResult for display in chat
 * @param ttsResult - Text-to-speech result
 * @param options - Conversion options
 * @returns ICompletionResult with audio player and download link
 */
export const ttsResultToCompletion = (
    ttsResult: ITextToSpeechResult,
    options?: {
        showInputText?: boolean;
        inputText?: string;
    }
): ICompletionResult => {
    if (!ttsResult.ok) {
        return {
            ok: false,
            content: `**语音合成失败**\n\n${ttsResult.error}`,
            usage: null
        };
    }

    const lines: string[] = [];

    // Show input text if requested - 使用折叠处理长文本
    if (options?.showInputText && options.inputText) {
        const inputText = options.inputText;
        const MAX_PREVIEW_LENGTH = 100;

        lines.push(`### 输入文本\n`);

        if (inputText.length <= MAX_PREVIEW_LENGTH) {
            // 短文本直接显示引用格式
            lines.push(`${inputText.split('\n').map(l => '> ' + l).join('\n')}\n`);
        } else {
            // 长文本使用 details 折叠
            const preview = inputText.substring(0, MAX_PREVIEW_LENGTH).trim();
            lines.push(`> ${preview}...`);
            lines.push(`\n<details><summary>📄 展开完整输入 (${inputText.length} 字符)</summary>\n`);
            lines.push('```txt');
            lines.push(inputText);
            lines.push('```');
            lines.push('</details>\n');
        }
    }

    // Add audio player
    lines.push(`### 生成的语音\n`);

    // HTML5 audio player
    const format = ttsResult.format || 'mp3';
    lines.push(`<audio controls src="${ttsResult.audioUrl}" type="audio/${format}" />`);

    lines.push('\n请尽快下载保存, 资源在页面关闭后可能无法访问。');

    // Add metadata
    const metadata: string[] = [];
    if (ttsResult.format) metadata.push(`格式: ${ttsResult.format}`);
    if (ttsResult.audio) {
        metadata.push(`大小: ${formatFileSize(ttsResult.audio.size)}`);
    }

    if (metadata.length > 0) {
        lines.push(`\n*${metadata.join(' | ')}*`);
    }


    return {
        ok: true,
        content: lines.join('\n'),
        usage: null
    };
};
