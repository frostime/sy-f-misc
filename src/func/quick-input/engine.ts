import { confirm, showMessage } from "siyuan";
import { createDailynote, openBlock } from "@frostime/siyuan-plugin-kits";
import { appendBlock, createDocWithMd, getBlockByID, getIDsByHPath, insertBlock, prependBlock } from "@frostime/siyuan-plugin-kits/api";

import type { QuickInputTemplate } from "./types";

// 定界符 ${var}（非 {{var}}）：思源 kramdown 嵌入块语法为 {{...}}，使用 {{var}} 会与之冲突。
// render 先插值 ${var}，再将结果交给内核 kramdown 解析器（IAL 等）。
// pre/postExecuteScript、SQL/JS anchorGenerator、Squirrelly 条件/循环均 deferred（schema 预留字段位，引擎不接线）。
// Match ${key} or ${key:inline-arg}. The inline-arg is engine-specific (e.g. todayDailynoteId:notebookId).
const templateVarRegexp = () => /(\\)?\$\{(\w+)(:[^}]*)?\}/g;

export interface ExecuteResult {
    blockId: string;
}

export class QuickInputCancelled extends Error {
    constructor(message = 'QuickInput cancelled') {
        super(message);
        this.name = 'QuickInputCancelled';
    }
}

const pad2 = (value: number) => value.toString().padStart(2, '0');

export const createTimeVars = (date = new Date()): Record<string, string> => {
    const year = date.getFullYear().toString();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    const hour = pad2(date.getHours());
    const minute = pad2(date.getMinutes());
    const second = pad2(date.getSeconds());

    return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        date: `${year}-${month}-${day}`,
        time: `${hour}:${minute}:${second}`,
        datetime: `${year}-${month}-${day} ${hour}:${minute}:${second}`
    };
};

export const renderTemplateString = (input: string, ctx: Record<string, any>): string => {
    return input.replace(templateVarRegexp(), (_matched, escaped: string | undefined, key: string) => {
        if (escaped) return `\${${key}}`;
        const value = ctx[key];
        return value === undefined || value === null ? '' : String(value);
    });
};

export const extractTemplateVars = (input?: string): string[] => {
    if (!input) return [];
    const vars = new Set<string>();
    for (const match of input.matchAll(templateVarRegexp())) {
        if (match[1]) continue;
        vars.add(match[2]);
    }
    return [...vars];
};



const referencedVars = (template: QuickInputTemplate): Set<string> => {
    const source = [template.template ?? ''];
    if (template.insertTo.type === 'document') {
        source.push(template.insertTo.hpath);
    } else {
        source.push(template.insertTo.anchorId);
    }
    return new Set(source.flatMap(extractTemplateVars));
};

const extractInlineDailynoteNotebook = (anchorId: string): NotebookId | null => {
    const match = anchorId.match(/\$\{todayDailynoteId:([^}]+)\}/);
    return match ? match[1] as NotebookId : null;
};

const notebookForTemplate = (template: QuickInputTemplate): NotebookId | undefined => {
    if (template.insertTo.type === 'document') return template.insertTo.notebook;
    const inlineNotebook = extractInlineDailynoteNotebook(template.insertTo.anchorId);
    return inlineNotebook ?? template.insertTo.notebook;
};

export const resolveCtx = async (
    template: QuickInputTemplate,
    userInput: Record<string, any> = {},
    date = new Date()
): Promise<Record<string, any>> => {
    const ctx: Record<string, any> = {
        ...createTimeVars(date),
        ...userInput
    };

    const refs = referencedVars(template);
    if (refs.has('todayDailynoteId') && !ctx.todayDailynoteId) {
        const notebook = notebookForTemplate(template);
        if (!notebook) throw new Error('模板引用 ${todayDailynoteId}，但未配置日记本');
        const id = await createDailynote(notebook);
        if (!id) throw new Error('创建或获取今日日记失败');
        ctx.todayDailynoteId = id;
    }

    return ctx;
};

const firstOperationId = (operations: any): string | undefined => {
    return operations?.[0]?.doOperations?.find?.((operation: any) => operation?.id)?.id;
};

const showAndThrow = (message: string, error?: unknown): never => {
    console.error(`[quick-input] ${message}`, error ?? '');
    showMessage(message, 4000, 'error');
    throw error instanceof Error ? error : new Error(message);
};

const confirmDuplicateDocument = (hpath: string, count: number): Promise<boolean> => {
    return new Promise(resolve => {
        confirm(
            '确认创建重复文档',
            `路径「${hpath}」已经存在 ${count} 个文档。是否仍然创建一个新的同路径文档？`,
            () => resolve(true),
            () => resolve(false)
        );
    });
};

const renderedMarkdown = (template: QuickInputTemplate, ctx: Record<string, any>) => {
    const markdown = renderTemplateString(template.template ?? '', ctx);
    return markdown || '\n';
};

export const executeTemplate = async (
    template: QuickInputTemplate,
    userInput: Record<string, any> = {}
): Promise<ExecuteResult> => {
    try {
        const ctx = await resolveCtx(template, userInput);
        const markdown = renderedMarkdown(template, ctx);
        const shouldOpen = template.openBlock !== false;

        if (template.insertTo.type === 'document') {
            const hpath = renderTemplateString(template.insertTo.hpath, ctx);
            if (!template.insertTo.notebook) throw new Error('未配置目标笔记本');
            if (!hpath) throw new Error('文档路径为空');

            const existingIds = await getIDsByHPath(template.insertTo.notebook, hpath);
            if (existingIds.length > 0) {
                const confirmed = await confirmDuplicateDocument(hpath, existingIds.length);
                if (!confirmed) throw new QuickInputCancelled();
            }

            const docId = await createDocWithMd(template.insertTo.notebook, hpath, markdown);
            if (shouldOpen) openBlock(docId, { zoomIn: true });
            return { blockId: docId };
        } else if (template.insertTo.type === 'block') {
          const anchorId = renderTemplateString(template.insertTo.anchorId, ctx);
          if (!anchorId) throw new Error('目标块 ID 为空');

          const anchor = await getBlockByID(anchorId);
          if (!anchor) throw new Error(`目标块不存在: ${anchorId}`);

          const operations = template.insertTo.mode === 'append'
              ? await appendBlock('markdown', markdown, anchorId)
              : template.insertTo.mode === 'prepend'
                  ? await prependBlock('markdown', markdown, anchorId)
                  : template.insertTo.mode === 'before'
                      ? await insertBlock('markdown', markdown, anchorId)
                      : await insertBlock('markdown', markdown, undefined, anchorId);

          const blockId = firstOperationId(operations);
          if (!blockId) throw new Error('无法获取插入后的块 ID');
          if (shouldOpen) openBlock(blockId, { zoomIn: true });
          return { blockId };
        } else {
          throw new Error('未知的插入类型');
        }

    } catch (error) {
        if (error instanceof QuickInputCancelled) throw error;
        showAndThrow(error instanceof Error ? error.message : '快速输入执行失败', error);
    }
};
