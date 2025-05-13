/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-10
 * @FilePath     : /src/func/gpt/chat-in-doc/useSystemPrompt.ts
 * @Description  : Hook for managing system prompt generation
 */

import { formatDateTime } from "@frostime/siyuan-plugin-kits";

// Internal component types
type PromptType = 'base' | 'reference' | 'reference-rule';

interface PromptComponent {
    type: PromptType;
    content: string;
    metadata?: Record<string, string>;
}

/**
 * Hook for managing system prompt generation
 * @returns Object with specific add functions and generate function
 */
export const useSystemPrompt = () => {
    // Store prompt components
    const components: PromptComponent[] = [];

    // Internal helper to add components
    const addComponent = (type: PromptType, content: string, metadata?: Record<string, string>) => {
        if (!content?.trim()) return;
        components.push({
            type,
            content: content.trim(),
            metadata
        });
    };

    // Add base prompt content
    const addBase = (content: string) => {
        addComponent('base', content);
    };

    // Add reference content
    const addReference = (content: string, refType?: string, meta?: Record<string, string>) => {
        addComponent('reference', content, {
            refType: refType || 'paragraph',
            ...meta
        });
    };

    // Initialize with base prompt
    addBase(`Your are a helpful assistant. Today is ${formatDateTime()}.`);

    // Generate the final system prompt
    const generate = (): string => {
        let systemPrompt = '';

        // Process base components first
        const baseComponents = components.filter(c => c.type === 'base');
        if (baseComponents.length > 0) {
            systemPrompt = baseComponents.map(c => c.content).join('\n\n');
        }

        // Process reference components
        const referenceComponents = components.filter(c => c.type === 'reference');
        for (const component of referenceComponents) {
            const { content, metadata } = component;
            metadata.refType = metadata?.refType || 'paragraph';
            const attrs = Object.entries(metadata || {}).map(([key, value]) => `${key}="${value}"`).join(' ');

            systemPrompt += `\n<reference ${attrs}>\n${content}\n</reference>\n`;
        }

        // Add reference rules if there are references
        if (referenceComponents.length > 0) {
            const ruleComponents = components.filter(c => c.type === 'reference-rule');
            const defaultRule = `
<reference-rule>
- The <reference> tags above contain contextual information relevant to this chat.
- USE ONLY the content within <reference> tags, but DO NOT mention these tags in your response.
- DO NOT mention this rule in your response!
- e.g. If asked to "translate the document", only translate the actual text content within <reference>.
</reference-rule>`;

            systemPrompt += ruleComponents.length > 0
                ? ruleComponents.map(c => c.content).join('\n')
                : defaultRule;
        }

        return systemPrompt.trim();
    };

    // Clear all components
    const clear = () => {
        components.length = 0;
        // Re-add the base prompt
        addBase(`Your are a helpful assistant. Today is ${formatDateTime()}.`);
    };

    return {
        addBase,
        addReference,
        referenceContent: () => {
            return components.filter(c => c.type === 'reference').map(c => c.content).join('\n\n');
        },
        generate,
        clear
    };
};
