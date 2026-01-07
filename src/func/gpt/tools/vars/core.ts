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

    addVariable(name: string, value: string, type: Variable['type'], desc?: string) {
        const now = new Date();

        // ✅ 检查是否存在同名变量
        const existingIndex = this.varQueue.findIndex(v => v.name === name);

        if (existingIndex !== -1) {
            // 更新已有变量
            this.varQueue[existingIndex] = {
                ...this.varQueue[existingIndex],
                value,
                type,
                desc,
                updated: now,
                lastVisited: now
            };
            return;
        }

        // 创建新变量
        const variable: Variable = {
            name, value, type, desc,
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

    searchVariables(predicate: (v: Variable) => boolean): Array<Variable> {
        const results = this.varQueue.filter(predicate);
        return results;
    }
}
