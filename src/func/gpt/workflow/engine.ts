/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-01 22:03:32
 * @FilePath     : /src/func/gpt/workflow/engine.ts
 * @LastEditTime : 2025-05-03 16:13:47
 * @Description  : Workflow execution engine
 */

import {
    Workflow,
    WorkflowState,
    WorkflowNode,
    PromptNode,
    ScriptNode,
    RouteNode,
    LoopNode,
    NodeId
} from './types';
import { interpolateVariables, sendPrompt, generateNodeId, normalizeContext } from './utils';


/**
 * Mixin class for node normalization functionality
 */
export class NodeNormalizerMixin {
    // 存储规范化后的节点
    declare nodes: Record<NodeId, WorkflowNode>;

    /**
     * Normalize nodes to a record with IDs as keys
     * Handle inline node definitions and null entries
     */
    protected normalizeNodes(nodes: (WorkflowNode | null)[] | Record<NodeId, WorkflowNode>): Record<NodeId, WorkflowNode> {
        const result: Record<NodeId, WorkflowNode> = {};

        if (Array.isArray(nodes)) {
            // Process array of nodes
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];

                // Skip null nodes
                if (node === null) continue;

                const id = node.id || String(i);

                // Find next non-null node
                let j = i + 1;
                let nextId: string | null = null;
                while (j < nodes.length && nodes[j] === null) {
                    j++;
                }
                if (j < nodes.length) {
                    nextId = nodes[j]?.id || String(j);
                }

                // Clone the node and ensure it has an id
                const normalizedNode = { ...node, id };

                // Set next if not explicitly defined
                if (normalizedNode.next === undefined) {
                    normalizedNode.next = nextId;
                }

                // Process special node types
                if (normalizedNode.type === 'loop') {
                    (normalizedNode as LoopNode).body = this.normalizeLoopBodyNodes((normalizedNode as LoopNode).body);
                } else if (normalizedNode.type === 'route' && (normalizedNode as RouteNode).routes) {
                    (normalizedNode as RouteNode).routes = this.normalizeRouteNodes((normalizedNode as RouteNode).routes);
                }

                result[id] = normalizedNode;
            }
        } else {
            // Process record of nodes
            for (const [id, node] of Object.entries(nodes)) {
                if (!node) continue;

                // Clone the node and ensure it has an id
                const normalizedNode = { ...node, id: node.id || id };

                // Process special node types
                if (normalizedNode.type === 'loop') {
                    (normalizedNode as LoopNode).body = this.normalizeLoopBodyNodes((normalizedNode as LoopNode).body);
                } else if (normalizedNode.type === 'route' && (normalizedNode as RouteNode).routes) {
                    (normalizedNode as RouteNode).routes = this.normalizeRouteNodes((normalizedNode as RouteNode).routes);
                }

                result[id] = normalizedNode;
            }
        }

        return result;
    }

    /**
     * Normalize loop body nodes
     * Convert inline node definitions to IDs and add them to the nodes map
     */
    protected normalizeLoopBodyNodes(body: (NodeId | WorkflowNode)[]): NodeId[] {
        return body.map(item => {
            if (typeof item === 'string') {
                // Already a node ID
                return item;
            } else if (item && typeof item === 'object') {
                // Inline node definition
                const id = item.id || generateNodeId();
                const normalizedNode = { ...item, id };

                // Process nested special node types
                if (normalizedNode.type === 'loop') {
                    (normalizedNode as LoopNode).body = this.normalizeLoopBodyNodes((normalizedNode as LoopNode).body);
                } else if (normalizedNode.type === 'route' && (normalizedNode as RouteNode).routes) {
                    (normalizedNode as RouteNode).routes = this.normalizeRouteNodes((normalizedNode as RouteNode).routes);
                }

                // Add to nodes map
                this.nodes[id] = normalizedNode;
                return id;
            }

            // Invalid item
            throw new Error(`Invalid loop body item: ${JSON.stringify(item)}`);
        });
    }

    /**
     * Normalize route nodes
     * Convert inline node definitions to IDs and add them to the nodes map
     */
    protected normalizeRouteNodes(routes: Record<string, NodeId | WorkflowNode>): Record<string, NodeId> {
        const result: Record<string, NodeId> = {};

        for (const [key, value] of Object.entries(routes)) {
            if (typeof value === 'string') {
                // Already a node ID
                result[key] = value;
            } else if (value && typeof value === 'object') {
                // Inline node definition
                const id = value.id || generateNodeId();
                const normalizedNode = { ...value, id };

                // Process nested special node types
                if (normalizedNode.type === 'loop') {
                    (normalizedNode as LoopNode).body = this.normalizeLoopBodyNodes((normalizedNode as LoopNode).body);
                } else if (normalizedNode.type === 'route' && (normalizedNode as RouteNode).routes) {
                    (normalizedNode as RouteNode).routes = this.normalizeRouteNodes((normalizedNode as RouteNode).routes);
                }

                // Add to nodes map
                this.nodes[id] = normalizedNode;
                result[key] = id;
            } else {
                // Invalid value
                throw new Error(`Invalid route value for key ${key}: ${JSON.stringify(value)}`);
            }
        }

        return result;
    }
}



/**
 * Base workflow engine with core execution functionality
 */
export class WorkflowEngine extends NodeNormalizerMixin {
    workflow: Workflow;
    state: WorkflowState;
    nodes: Record<NodeId, WorkflowNode> = {};

    constructor(workflow: Workflow, input: string, initialVariables: Record<string, any> = {}) {
        super();
        this.workflow = workflow;

        // Normalize nodes to a record if they're provided as an array
        this.nodes = this.normalizeNodes(workflow.nodes);

        // Determine entrypoint
        let entrypoint = workflow.entrypoint;
        if (!entrypoint) {
            if (Array.isArray(workflow.nodes)) {
                // Find first non-null node
                const firstNodeIndex = workflow.nodes.findIndex(node => node !== null);
                entrypoint = firstNodeIndex >= 0 ? String(firstNodeIndex) : null;
            } else {
                // First key in object
                entrypoint = Object.keys(workflow.nodes)[0] || null;
            }
        }

        this.state = {
            input,
            output: '',
            variables: { ...initialVariables },
            currentNode: entrypoint,
            history: [],
            context: {}
        };
    }

    /**
     * Execute the workflow
     */
    async execute(): Promise<WorkflowState> {
        const MAX_EXECUTIONS = 200;
        let executions = 0;
        while (this.state.currentNode && executions < MAX_EXECUTIONS) {
            executions++;

            const node = this.nodes[this.state.currentNode];
            if (!node) break;

            this.state.history.push(this.state.currentNode);

            // Execute the node
            await this.executeNode(node);

            // Handle variable writing if specified
            if (node.writeVar !== undefined) {
                const varName = typeof node.writeVar === 'string' ? node.writeVar : node.id;
                this.state.variables[varName] = this.state.output;
            }

            if (executions >= MAX_EXECUTIONS) {
                console.warn(`Workflow execution exceeded ${MAX_EXECUTIONS} iterations`);
                break;
            }
        }

        return this.state;
    }

    /**
     * Execute a single node
     */
    async executeNode(node: WorkflowNode, useDefNext = true): Promise<void> {
        if (!node) return;

        switch (node.type) {
            case 'prompt':
                await this.executePromptNode(node as PromptNode);
                if (useDefNext) {
                    this.state.currentNode = node.next || null;
                }
                break;
            case 'script':
                await this.executeScriptNode(node as ScriptNode);
                if (useDefNext) {
                    this.state.currentNode = node.next || null;
                }
                break;
            case 'route':
                await this.executeRouteNode(node as RouteNode);
                // Route node sets currentNode directly
                break;
            case 'loop':
                await this.executeLoopNode(node as LoopNode);
                // Loop node sets currentNode directly
                break;
        }
    }

    /**
     * Execute a prompt node for single prompts
     */
    async executePromptNode(node: PromptNode): Promise<void> {
        let promptText: string;
        if (typeof node.prompt === 'function') {
            promptText = node.prompt(this.state);
        } else {
            promptText = interpolateVariables(node.prompt, {
                ...this.state.variables,
                input: this.state.input,
                output: this.state.output
            });
        }

        // Send the prompt to the LLM with model and completion options
        const result = await sendPrompt(promptText, {
            modelId: node.model,
            systemPrompt: node.systemPrompt,
            chatOptions: node.options,
            conversationContext: node.context,
            workflowState: this.state
        });


        // Store the result in the state output
        this.state.output = result.content;

        // Update context if needed
        if (node.context && result.updatedMessages) {
            const context = normalizeContext(node.context);
            this.state.context[context.name] = result.updatedMessages;
        }
    }

    /**
     * Execute a script node
     */
    async executeScriptNode(node: ScriptNode): Promise<void> {
        // Execute the handler function
        const output = await node.handler(this.state);
        this.state.output = output;
    }

    /**
     * Execute a route node
     */
    async executeRouteNode(node: RouteNode): Promise<void> {
        let nextNodeId: NodeId | null = null;
        const routeKey = node.condition(this.state);

        if (node.routes) {
            const routeValue = node.routes[routeKey];
            if (routeValue) {
                if (typeof routeValue === 'string') {
                    nextNodeId = routeValue;
                } else if (routeValue && typeof routeValue === 'object' && routeValue !== null) {
                    const id = (routeValue as WorkflowNode).id || null;
                    nextNodeId = id;
                }
            }
        } else {
            nextNodeId = routeKey;
        }

        this.state.currentNode = nextNodeId;
    }

    /**
     * Execute a loop node using iterative approach
     */
    async executeLoopNode(node: LoopNode): Promise<void> {
        // 初始化迭代计数器
        let iterations = 0;
        const bodyNodeIds = node.body as NodeId[]; // Already normalized to IDs

        // 使用循环代替递归
        while (iterations < node.maxIterations && node.condition(this.state)) {
            // 增加迭代计数
            iterations++;

            // 执行循环体中的所有节点
            for (const nodeId of bodyNodeIds) {
                const bodyNode = this.nodes[nodeId];
                if (!bodyNode) continue;

                // 记录历史
                this.state.history.push(nodeId);

                // 执行节点
                await this.executeNode(bodyNode, false);

                // 处理变量写入
                if (bodyNode.writeVar !== undefined) {
                    const varName = typeof bodyNode.writeVar === 'string' ? bodyNode.writeVar : bodyNode.id;
                    this.state.variables[varName] = this.state.output;
                }
            }

            if (iterations >= node.maxIterations) {
                break;
            }
        }

        // 退出循环，设置下一个节点
        this.state.currentNode = node.next || null;
    }
}
