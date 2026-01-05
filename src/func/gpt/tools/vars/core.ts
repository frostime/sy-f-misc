//缓存大模型过程中各种文本，作为变量方便后面 LLM 复用
interface Variable {
    name: string;
    value: string;
    desc?: string
    created: Date;
    updated: Date;
    lastVisited: Date;
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

    addVariable(name: string, value: string, desc?: string) {
        const now = new Date();
        const variable: Variable = {
            name,
            value,
            created: now,
            updated: now,
            lastVisited: now,
            desc
        };
        this.varQueue.push(variable);
        // 超过容量，删除最不常用的变量
        if (this.varQueue.length > this.capacity) {
            this.varQueue.sort((a, b) => {
                return defaultCompare(a, b);
            });
            this.varQueue.pop();
        }
    }

    getVariable(name: string): Variable | undefined {
        const variable = this.varQueue.find(v => v.name === name);
        if (variable) {
            variable.lastVisited = new Date();
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
}
