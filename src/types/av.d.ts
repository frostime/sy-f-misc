type AvID = BlockId;

type AvColType =
    | "block"
    | "text"
    | "number"
    | "date"
    | "select"
    | "mSelect"
    | "url"
    | "email"
    | "phone"
    | "mAsset"
    | "template"
    | "created"
    | "updated"
    | "checkbox"
    | "relation"
    | "rollup"
    | "lineNumber";

/**
 * Type definitions for attribute view related structures
 */
interface IAVColumn {
    id: string;
    name: string;
    type: AvColType;
    icon: string;
    desc?: string;
    options?: {
        name: string;
        color: string;
        desc?: string;
    }[];
    numberFormat?: unknown;
    template?: string;
    relation?: IAVColumnRelation;
    rollup?: IAVCellRollupValue;
    date?: {
        autoFillNow: boolean,
    }
}

interface IAVCalc {
    operator?: string,
    result?: IAVCellValue
}

interface IAVCellRelationValue {
    blockIDs: string[];
    contents?: IAVCellValue[];
}

interface IAVCellDateValue {
    content?: number,
    isNotEmpty?: boolean
    content2?: number,
    isNotEmpty2?: boolean
    hasEndDate?: boolean
    formattedContent?: string,
    isNotTime?: boolean // 默认 true
}

interface IAVCellSelectValue {
    content: string,
    color: string
}

interface IAVCellAssetValue {
    content: string,
    name: string,
    type: "file" | "image"
}

interface IAVColumnRelation {
    avID?: string;
    backKeyID?: string;
    isTwoWay?: boolean;
}

interface IAVCellRollupValue {
    relationKeyID?: string;  // 关联列 ID
    keyID?: string;
    calc?: IAVCalc;
}

interface IAVCellValue {
    id: string;
    keyID: string;
    blockID: string;
    type: AvColType;
    createdAt: number;
    updatedAt: number;
    block?: {
        id: string;  // AV 绑定的块 ID
        icon: string;
        content: string;
        created: number;
        updated: number;
    };
    text?: {
        content: string
    };
    number?: {
        content?: number,
        isNotEmpty: boolean,
        format?: string,
        formattedContent?: string
    },
    mSelect?: IAVCellSelectValue[];
    mAsset?: IAVCellAssetValue[];
    url?: {
        content: string
    };
    phone?: {
        content: string
    };
    email?: {
        content: string
    };
    template?: {
        content: string
    };
    checkbox?: {
        checked: boolean
    };
    relation?: IAVCellRelationValue;
    rollup?: {
        contents?: IAVCellValue[]
    };
    date?: IAVCellDateValue;
    created?: IAVCellDateValue;
    updated?: IAVCellDateValue;
}

interface IAVRow {
    key: IAVColumn;
    values: IAVCellValue[];
}

interface AttributeView {
    id: string;
    name: string;
    viewID?: string;
    viewType?: string;
    views?: Array<{
        id: string;
        icon: string;
        name: string;
        hideAttrViewName: boolean;
        type: string;
        pageSize?: number;
        desc?: string;
    }>;
    isMirror?: boolean;
    view?: any;
}

interface AttributeViewFilter {
    column: string;
    operator: string;
    value: any;
}

interface AttributeViewSort {
    column: string;
    order: string;
}
