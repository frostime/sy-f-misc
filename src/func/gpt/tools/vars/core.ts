//缓存大模型过程中各种文本，作为变量方便后面 LLM 复用
export const VAR_TYPE_ENUM = ['RULE', 'ToolCallResult', 'ToolCallArgs', 'MessageCache', 'LLMAdd', 'USER_ADD'] as const;

/**
 * 格式化 Rule 变量名
 * @param varName 变量名
 * @param scope 作用域（可选）
 * @returns 格式化的 Rule 变量名，如 "Rule::scope::varName" 或 "Rule::varName"
 */
export function formatRuleVar(varName: string, scope?: string): string {
    if (scope) {
        return `Rule/${scope}/${varName}`;
    }
    return `Rule/${varName}`;
}

export interface Variable {
    name: string;
    value: string;
    desc?: string
    created: Date;
    updated: Date;
    lastVisited: Date;

    keep?: boolean;  // 总是保留在 queue 中不被删除
    // type: 'RULE' | 'ToolCallResult' | 'ToolCallArgs' | 'MessageCache' | 'LLMAdd';  // 变量类型，方便分类管理
    type: typeof VAR_TYPE_ENUM[number];
    // RULE | ToolCallCache | MessageCache | LLMAdd
    referenceCount?: number;  // 被引用次数

    tags?: string[];
}

const defaultCompare = (a: Variable, b: Variable) => {
    // 按照 lastVisited, updated, created, name 顺序排序
    if (a.lastVisited !== b.lastVisited) {
        return b.lastVisited.getTime() - a.lastVisited.getTime();
    }
    if (a.updated !== b.updated) {
        return b.updated.getTime() - a.updated.getTime();
    }
    if (a.created !== b.created) {
        return b.created.getTime() - a.created.getTime();
    }
    return a.name.localeCompare(b.name);
}

export class VariableSystem {

    capacity: number = 1000;
    varQueue: Array<Variable>;

    constructor(capacity: number = 1000) {
        this.capacity = capacity;
        this.varQueue = [];
    }

    /**
     * 更新变量（支持更新 value 和 tags）
     */
    updateVariable(
        name: string,
        options: {
            value?: string;
            type?: Variable['type'];
            desc?: string;
            tags?: string[];
            keep?: boolean;
        }
    ) {
        const now = new Date();
        const existingIndex = this.varQueue.findIndex(v => v.name === name);

        if (existingIndex !== -1) {
            // 更新已有变量
            const existing = this.varQueue[existingIndex];
            this.varQueue[existingIndex] = {
                ...existing,
                ...(options.value !== undefined && { value: options.value }),
                ...(options.type !== undefined && { type: options.type }),
                ...(options.desc !== undefined && { desc: options.desc }),
                ...(options.tags !== undefined && { tags: options.tags }),
                ...(options.keep !== undefined && { keep: options.keep }),
                updated: now,
                lastVisited: now
            };
            return;
        }

        // 创建新变量（需要 value 和 type）
        if (options.value === undefined || options.type === undefined) {
            throw new Error('Cannot create variable without value and type');
        }

        const variable: Variable = {
            name,
            value: options.value,
            type: options.type,
            desc: options.desc,
            tags: options.tags,
            keep: options.keep,
            created: now,
            updated: now,
            lastVisited: now,
            referenceCount: 0
        };

        this.varQueue.push(variable);

        // 超过容量，删除最不常用的变量（考虑 keep）
        if (this.varQueue.length > this.capacity) {
            const keepVars = this.varQueue.filter(v => v.keep);
            const normalVars = this.varQueue.filter(v => !v.keep);

            if (normalVars.length > 0) {
                normalVars.sort((a, b) => defaultCompare(a, b));
                normalVars.pop();
                this.varQueue = [...keepVars, ...normalVars];
            }
        }
    }

    /**
     * 添加变量（简化接口）
     */
    addVariable(name: string, value: string, type: Variable['type'], desc?: string, tags?: string[]) {
        this.updateVariable(name, { value, type, desc, tags });
    }

    getVariable(name: string, recordRef: boolean = true): Variable | undefined {
        const variable = this.varQueue.find(v => v.name === name);
        if (variable && recordRef) {
            variable.lastVisited = new Date();
            variable.referenceCount = (variable.referenceCount || 0) + 1;  // ✅ 统计使用
        }
        return variable;
    }

    listVariables(): Array<Variable> {
        const sortedVars = [...this.varQueue].sort((a, b) => {
            return defaultCompare(a, b);
        });
        return sortedVars;
    }

    removeVariable(name: string): boolean {
        const index = this.varQueue.findIndex(v => v.name === name);
        if (index !== -1) {
            this.varQueue.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * 批量删除变量（不能删除 Rule 类型的变量）
     * @returns 成功删除的变量名列表和失败的变量名列表
     */
    removeVariables(names: string[]): { removed: string[]; failed: string[] } {
        const removed: string[] = [];
        const failed: string[] = [];

        for (const name of names) {
            const variable = this.getVariable(name, false);
            if (!variable) {
                failed.push(name);
                continue;
            }

            // 不能删除 Rule 类型的变量
            if (variable.type === 'RULE') {
                failed.push(name);
                continue;
            }

            if (this.removeVariable(name)) {
                removed.push(name);
            } else {
                failed.push(name);
            }
        }

        return { removed, failed };
    }

    searchVariables(predicate: (v: Variable) => boolean): Array<Variable> {
        const results = this.varQueue.filter(predicate);
        return results;
    }
}
