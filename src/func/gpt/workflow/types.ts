/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-01 22:03:32
 * @FilePath     : /src/func/gpt/workflow/types.ts
 * @LastEditTime : 2025-05-03 16:15:24
 * @Description  : Type definitions for workflow feature
 */

// Semantic type aliases
export type NodeId = string;
export type WorkflowId = string;

// Forward declaration for recursive types
export interface PromptNode extends BaseNode { }
export interface ScriptNode extends BaseNode { }
export interface RouteNode extends BaseNode { }
export interface LoopNode extends BaseNode { }
export type WorkflowNode = PromptNode | ScriptNode | RouteNode | LoopNode | null;

// Base node interface
export interface BaseNode {
    id?: NodeId; // Optional - will use index as default if not provided
    type: 'prompt' | 'script' | 'route' | 'loop';
    next?: NodeId | null; // ID of the next node or null for end
    writeVar?: boolean | string; // If true, write output to variable named after node id; if string, use that name
}

// Enhanced prompt node for single prompts
export interface PromptNode extends BaseNode {
    type: 'prompt';
    // Single prompt (string or function)
    prompt: string | ((state: WorkflowState) => string);
    // Model specification
    model?: string; // Model identifier
    systemPrompt?: string; // Override system prompt for this specific node
    // Completion options
    options?: IChatOption;

    //在发送消息的时候附带上下文消息
    context?: {
        name: string;  // key in state
        limit?: number; // default as whole context messages
        update?: boolean; //是否更新 context 消息, 默认 true
    } | true; // 如果为 true，使用默认配置: name: DEFAULT, LIMIT 无, update: true
}

// Script node - executes a function
export interface ScriptNode extends BaseNode {
    type: 'script';
    handler: (state: WorkflowState) => Promise<any> | any;
}

// Route node - determines next node based on conditions
export interface RouteNode extends BaseNode {
    type: 'route';
    // Function to determine which route to take
    condition: (state: WorkflowState) => NodeId | string;
    routes?: Record<string, NodeId | WorkflowNode>;
}

// Loop node - repeats execution of nodes
export interface LoopNode extends BaseNode {
    type: 'loop';
    // Body can be an array of node IDs or inline node definitions
    body: (NodeId | WorkflowNode)[];
    condition: (state: WorkflowState) => boolean; // Function that returns true to continue the loop
    maxIterations: number; // Maximum number of iterations to prevent infinite loops
}

// Loop state tracking is no longer needed with recursive approach

// Workflow definition with support for array of nodes
export interface Workflow {
    id: WorkflowId;
    name: string;
    description?: string;
    // Nodes can be either an array or a record, and can include null entries
    nodes: (WorkflowNode | null)[] | Record<NodeId, WorkflowNode>;
    // Entrypoint is optional when using array (defaults to first non-null node)
    entrypoint?: NodeId;
}

// State maintained during workflow execution
export interface WorkflowState {
    input: string;
    output: any;
    variables: Record<string, any>;
    currentNode: NodeId | null;
    history: NodeId[];
    context?: Record<string, IMessage[]>;
}
