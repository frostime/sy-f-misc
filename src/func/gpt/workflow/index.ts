/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-01 22:03:32
 * @FilePath     : /src/func/gpt/workflow/index.ts
 * @LastEditTime : 2025-05-03 15:59:55
 * @Description  : Workflow feature for GPT
 */

import { Workflow, WorkflowState, WorkflowId } from './types';
import { WorkflowEngine } from './engine';
import * as builtinWorkflows from './builtin';

/**
 * Run a workflow with the given input and initial variables
 */
export async function runWorkflow(
    workflow: Workflow | WorkflowId,
    input: string,
    initialVariables: Record<string, any> = {}
): Promise<WorkflowState> {
    // If workflow is a string ID, look it up in builtin workflows
    const workflowObj = typeof workflow === 'string'
        ? builtinWorkflows.default[workflow]
        : workflow;

    if (!workflowObj) {
        throw new Error(`Workflow not found: ${workflow}`);
    }

    const engine = new WorkflowEngine(workflowObj, input, initialVariables);
    return await engine.execute();
}

// Export types and utilities
export * from './types';
export * from './utils';

// Export builtin workflows
export { builtinWorkflows };
