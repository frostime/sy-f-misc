/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-01 22:03:32
 * @FilePath     : /src/func/gpt/workflow/utils.ts
 * @LastEditTime : 2025-05-03 16:18:49
 * @Description  : Utility functions for workflow feature
 */

import { WorkflowState, PromptNode } from './types';
import { complete } from '../openai';
import { useModel } from '../setting/store';

/**
 * Interpolate variables in a template string
 */
export function interpolateVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const path = key.trim().split('.');
        let value = variables;

        for (const prop of path) {
            if (value === undefined || value === null) return '';
            value = value[prop];
        }

        return value !== undefined ? String(value) : '';
    });
}

/**
 * Normalize the context parameter for prompt sending
 * @param context Optional context configuration for conversation history
 * @returns Normalized context configuration or undefined if not applicable
 */
export function normalizeContext(context?: PromptNode['context'] | boolean): { name: string; update: boolean; limit?: number } | undefined {
    if (context === true) {
        return { name: 'DEFAULT', update: true };
    }
    //@ts-ignore
    return typeof context === 'object' ? context : undefined;
}

/**
 * Send a prompt to the LLM and get the response
 * @param prompt The prompt text to send
 * @param config Revised configuration object (assuming you renamed 'options' to 'config')
 * @returns The response content and updated context messages if applicable
 */
export async function sendPrompt(
    prompt: string,
    config: {
        modelId?: string,
        systemPrompt?: string,
        chatOptions?: IChatOption,
        conversationContext?: PromptNode['context'],
        workflowState?: WorkflowState
    }
): Promise<{ content: string; updatedMessages?: any[] }> {
    // Normalize context parameter
    const normalizedContext = normalizeContext(config.conversationContext);

    // If no context is provided or state is missing, use simple prompt
    if (!normalizedContext || !config.workflowState || !config.workflowState.context) {
        const response = await complete(prompt, {
            model: config.modelId ? useModel(config.modelId) : undefined,
            systemPrompt: config.systemPrompt,
            option: config.chatOptions,
            stream: config.chatOptions?.stream ?? false
        });

        return { content: response.content };
    }

    // Get context messages from state
    const contextName = normalizedContext.name;
    const contextMessages = config.workflowState.context[contextName] || [];

    // Apply limit if specified
    const limitedContextMessages = normalizedContext.limit
        ? contextMessages.slice(-normalizedContext.limit)
        : contextMessages;

    // Create messages array with context and new prompt
    const messages = [
        ...limitedContextMessages,
        { role: 'user' as const, content: prompt }
    ];

    // Send the messages to the LLM
    const response = await complete(messages, {
        model: config.modelId ? useModel(config.modelId) : undefined,
        systemPrompt: config.systemPrompt,
        option: config.chatOptions,
        stream: config.chatOptions?.stream ?? false
    });

    // Prepare updated messages if needed
    let updatedMessages: any[] | undefined;
    const shouldUpdateContext = normalizedContext.update !== false;

    if (shouldUpdateContext) {
        updatedMessages = [
            ...limitedContextMessages,
            { role: 'user' as const, content: prompt },
            { role: 'assistant' as const, content: response.content }
        ];
    }

    return {
        content: response.content,
        updatedMessages
    };
}


/**
 * Update a variable in the workflow state
 */
export function updateVariable(state: WorkflowState, key: string, value: any): void {
    state.variables[key] = value;
}

/**
 * Get a variable from the workflow state with optional default value
 */
export function getVariable(state: WorkflowState, key: string, defaultValue?: any): any {
    return state.variables[key] !== undefined ? state.variables[key] : defaultValue;
}

/**
 * Generate a unique node ID
 */
export function generateNodeId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
