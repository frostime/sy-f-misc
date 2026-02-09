# Preset SDK API Reference

Complete API for `window.pluginSdk` when `presetSdk: true` (default).

All `customSdk` methods are flat-merged into this same object — access everything directly on `window.pluginSdk`.

---

## SiYuan Data APIs

### `request(endpoint, data)`

Call any SiYuan kernel API.

```typescript
request(endpoint: string, data: any): Promise<{ ok: boolean; data: any }>
```

```javascript
const result = await sdk.request('/api/block/appendDailyNoteBlock', {
    dataType: "markdown",
    data: "New content",
    notebook: "20220112192155-gzmnt6y"
});
if (result.ok) console.log('Success:', result.data);
```

### `querySQL(sql)`

Execute SQL query against SiYuan's block database. Default LIMIT 32 if not specified.

```typescript
querySQL(query: string): Promise<Block[] | any>
```

```javascript
const blocks = await sdk.querySQL(`
    SELECT * FROM blocks WHERE type = 'd' AND box = '${notebookId}' LIMIT 50
`);
```

### `getBlockByID(id)`

```typescript
getBlockByID(blockId: string): Promise<Block | null>
```

### `getMarkdown(id)`

Get block's markdown content.

```typescript
getMarkdown(blockId: string): Promise<string>
```

### `queryDailyNote(options?)`

```typescript
queryDailyNote(options?: {
    boxId?: string;
    before?: Date;
    after?: Date;
    limit?: number;
}): Promise<Block[]>
```

### `queryChildDocs(docId)`

```typescript
queryChildDocs(docId: string): Promise<Block[]>
```

### `queryParentDoc(docId)`

```typescript
queryParentDoc(docId: string): Promise<Block | null>
```

### `queryBacklinks(blockId)`

Get blocks that reference this block.

```typescript
queryBacklinks(blockId: string): Promise<Block[]>
```

### `lsNotebooks()`

List all open notebooks.

```typescript
lsNotebooks(): Array<{ name: string; id: string; closed: boolean }>
```

```javascript
const notebooks = sdk.lsNotebooks(); // Synchronous!
const first = notebooks[0];
console.log(`${first.name} (${first.id})`);
```

### `openBlock(blockId)`

Navigate to a block in SiYuan's editor.

```typescript
openBlock(blockId: string): void
```

### `createDailynote(options)`

```typescript
createDailynote(options: {
    notebookId: string;
    date?: Date;      // defaults to today
    content?: string;  // defaults to ''
}): Promise<string>   // returns new doc ID
```

---

## File System APIs

### `saveBlob(path, data)`

Save file to SiYuan workspace.

```typescript
saveBlob(path: string, data: Blob | File): Promise<{ ok: boolean; error?: 'Unsupported Data' | 'Save Error' }>
```

⚠️ **Writing to `.sy` document files is forbidden** — the function will reject paths matching `*.sy` with a document ID filename.

### `loadBlob(path)`

Load file from SiYuan workspace.

```typescript
loadBlob(path: string): Promise<{ ok: boolean; data?: Blob | null }>
```

```javascript
const result = await sdk.loadBlob('/data/assets/image-20231010.png');
if (result.ok) {
    const url = URL.createObjectURL(result.data);
}
```

---

## UI APIs

### `showMessage(message, type?, duration?)`

```typescript
showMessage(message: string, type?: 'info' | 'error', duration?: number): void
// type defaults to 'info', duration defaults to 3000ms
```

### `confirm(title, text, confirmCallback?, cancelCallback?)`

Show a confirmation dialog.

```typescript
confirm(
    title: string,
    text: string,
    confirmCallback?: () => void,
    cancelCallback?: () => void
): void
```

### `showDialog(options)`

Show a dialog with custom HTML content.

```typescript
showDialog(options: {
    title: string;
    ele: HTMLElement | DocumentFragment;
    width?: string;
    height?: string;
    afterClose?: () => void;
}): { close: () => void; container: HTMLElement }
```

### `inputDialog(options)`

Show an input dialog.

```typescript
inputDialog(options: {
    title: string;
    defaultText?: string;
    confirm?: (text: string) => void;
    cancel?: (text: string) => void;
    destroyCallback?: (text: string) => void;
    type?: 'textline' | 'textarea';
    width?: string;
    height?: string;
    fontSize?: string;
}): { close: () => void; container: HTMLElement }
```

---

## Utilities

### `lute`

SiYuan's Lute Markdown parser instance.

```typescript
interface Lute {
    Md2HTML(markdown: string): string;
    HTML2Md(html: string): string;
}
```

```javascript
const html = sdk.lute.Md2HTML('**bold** text');
const md = sdk.lute.HTML2Md('<strong>bold</strong> text');
```

### `argApp()`

Returns `app.appId`, needed by some SiYuan kernel APIs.

```typescript
argApp(): string
```

### `themeMode`

Current theme mode.

```typescript
themeMode: 'light' | 'dark'
```

### `styleVar`

All injected CSS variable values as a JavaScript object. Keys have **no** `b3-` prefix.

```typescript
styleVar: {
    'font-family': string;
    'font-size': string;
    'font-family-code': string;
    'font-family-emoji': string;
    'theme-mode': 'light' | 'dark';
    'theme-primary': string;
    'theme-primary-light': string;
    'theme-primary-lightest': string;
    'theme-on-primary': string;
    'theme-background': string;
    'theme-on-background': string;
    'theme-surface': string;
    'theme-surface-light': string;
    'theme-surface-lighter': string;
    'theme-on-surface': string;
    'theme-on-surface-light': string;
}
```

---

## Type Definitions

### `Block`

```typescript
type BlockId = string;

type Block = {
    id: BlockId;
    parent_id?: BlockId;
    root_id: string;
    hash: string;
    box: string;          // notebook ID
    path: string;         // ID path: "/<parentDocId>/<docId>.sy"
    hpath: string;        // readable path: "/Parent Name/Doc Name"
    name: string;
    alias: string;
    memo: string;
    tag: string;
    content: string;
    fcontent?: string;
    markdown: string;
    length: number;
    type: string;         // 'd'=doc, 'p'=paragraph, 'h'=heading, 'l'=list, 'i'=list-item, etc.
    subtype: string;
    ial?: string;
    sort: number;
    created: string;      // format: "20231224140619"
    updated: string;
};
```
