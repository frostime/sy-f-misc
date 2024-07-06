/*
 * Copyright (c) 2023 by Yp Z (frostime). All Rights Reserved.
 * @Author       : Yp Z
 * @Date         : 2023-07-29 15:17:15
 * @FilePath     : /src/func/bookmarks/model/rules.ts
 * @LastEditTime : 2024-07-06 22:07:07
 * @Description  : 
 */
import * as api from "@/api";


export abstract class MatchRule implements IDynamicRule {
    type: TRuleType;
    input: any;

    protected eof: boolean = false;

    constructor(type: TRuleType) {
        this.type = type;
        this.input = null;
    }

    dump(): IDynamicRule {
        return {
            type: this.type,
            input: this.input
        }
    }

    abstract fetch(): Promise<Block[]>;

    iseof() {
        return this.eof;
    }

    reset() {
        this.eof = false;
    }

    input2Text() {
        if (this.input === null) {
            return "";
        }
        if (Array.isArray(this.input)) {
            return this.input.join("\n");
        }
        return `${this.input}`;
    }

    abstract updateInput(input: any);

    validateInput() { return true; } // 检查输入的 this.input 的格式是否符合要
}

const matchIDFormat = (id: string) => {
    let match = id.match(/^\d{14}-[a-z0-9]{7}$/);
    if (match) {
        return true;
    } else {
        return false;
    }
}


export class Backlinks extends MatchRule {
    constructor(id: BlockId) {
        super("backlinks");
        this.updateInput(id);
    }

    updateInput(id: BlockId) {
        this.input = id;
    }

    validateInput(): boolean {
        return matchIDFormat(this.input) !== null;
    }

    async fetch() {
        this.eof = true;
        if (!this.input) {
            return [];
        }
        const sql = `
            select blocks.* 
            from blocks 
            join refs on blocks.id = refs.block_id 
            where refs.def_block_id = '${this.input}' 
            order by blocks.updated desc 
            limit 999;
        `;
        const blocks = await api.sql(sql);
        return blocks ?? [];
    }

}

export class SQL extends MatchRule {
    constructor(sqlCode: string) {
        super("sql");
        this.updateInput(sqlCode);
    }

    updateInput(sqlCode: any) {
        // 将 SQL 语句中的 \*、\[、\] 和 \S 替换为 \\*、\\[、\\] 和 \\S
        // 这样在 JavaScript 中，它们将被解析为原本期望的正则表达式
        this.input = sqlCode.replace(/\\(\*|\[|\]|\S)/g, '\\\\$1');
    }

    validateInput(): boolean {
        //是否是 SQL 语法
        let pat = /select\s+([\s\S]+?)\s+from\s+([\s\S]+?)\s*$/i;
        if (!pat.test(this.input)) {
            return false;
        }
        return true;
    }

    async fetch() {
        this.eof = true;
        if (!this.input) {
            return [];
        }
        let result = await api.sql(this.input);
        return result ?? [];
    }
}

export const getRule = (dynamicRule: IDynamicRule): MatchRule => {
    const maps = {
        'sql': SQL,
        'backlinks': Backlinks
    };
    const Rule = maps[dynamicRule.type];
    if (!Rule) return null;
    let RuleObj = new Rule(dynamicRule.input);
    return RuleObj
}

