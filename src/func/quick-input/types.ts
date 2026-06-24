import type { SimpleFormField } from "@/libs/components/simple-form";

export type InsertMode = 'append' | 'prepend' | 'before' | 'after';

export type InsertTo =
    | {
          type: 'document';
          notebook: NotebookId;
          hpath: string;
      }
    | {
          type: 'block';
          anchorId: string;
          mode: InsertMode;
          notebook?: NotebookId;
      };

export type DeclaredInputType = Extract<SimpleFormField['type'], 'text' | 'textarea' | 'number' | 'checkbox' | 'select'>;

export interface DeclaredVar extends Omit<SimpleFormField, 'type'> {
    type: DeclaredInputType;
}

export interface QuickInputTemplate {
    id: string;
    name: string;
    icon?: string;
    group?: string;
    insertTo: InsertTo;
    template?: string;
    declaredInputVar?: DeclaredVar[];
    openBlock?: boolean;
    preExecuteScript?: string;
    postExecuteScript?: string;
    createdAt?: number;
    updatedAt?: number;
}

export interface QuickInputConfig {
    templates: QuickInputTemplate[];
}
