# SiYuan Context Reference

## File System Structure

```
data/
├── <notebookId>/              # Notebook (e.g., 20220112192155-gzmnt6y/)
│   ├── <docId>/               # Sub-document directory
│   │   └── <childDocId>.sy    # Child document file
│   └── <docId>.sy             # Document file
├── assets/                    # Attachments (images, files)
├── plugins/                   # Plugin directory
├── public/                    # Public resources
├── templates/                 # Templates
└── widgets/                   # Widgets
```

### Path Types

| Path type | Example | Description |
|---|---|---|
| `path` | `/20220320150131-kdhgvaj.sy` | ID-based, unique within notebook |
| `hpath` | `/Inbox/My Note` | Human-readable name path |
| Full file path | `/data/20220112192155-gzmnt6y/20220320150131-kdhgvaj.sy` | For `loadBlob`/`saveBlob` |

**Block attributes from SQL query:**
```javascript
{
    id: "20220320150131-kdhgvaj",       // Block/Document ID
    box: "20220112192155-gzmnt6y",      // Notebook ID
    hpath: "/Inbox",                     // Human-readable path
    path: "/20220320150131-kdhgvaj.sy"  // ID path within notebook
}
```

### Static Routes

SiYuan serves these paths directly — accessible via `fetch`:

| Route | Maps to |
|---|---|
| `assets/*` | `/data/assets/*` |
| `public/*` | `/data/public/*` |

Example: `![image](assets/image-20240731195519-xgw9ya7.png)`

---

## Block Reference Syntax

**Block link** (clickable):
```markdown
[display text](siyuan://blocks/<blockId>)
```

**Block embed** (renders referenced content):
```markdown
((<blockId> "anchor text"))
((<blockId> 'anchor text'))
```

---

## Block Types

| `type` value | Meaning |
|---|---|
| `d` | Document |
| `p` | Paragraph |
| `h` | Heading |
| `l` | List |
| `i` | List item |
| `c` | Code block |
| `m` | Math block |
| `t` | Table |
| `b` | Blockquote |
| `s` | Super block |

---

## Kernel API Reference

For the full SiYuan kernel API, consult:
- **Chinese**: `https://raw.githubusercontent.com/siyuan-note/siyuan/refs/heads/master/API_zh_CN.md`

For the database schema (SQL table structure):
- `https://raw.githubusercontent.com/siyuan-community/siyuan-developer-docs/refs/heads/main/docs/zh-Hans/reference/database/table.md`

Use `sdk.request(endpoint, data)` to call any kernel API not wrapped by preset SDK methods.

---

## Capability Boundaries

### HSPA is suitable for:

- Standalone tools using SiYuan as a backend (dashboards, visualizations, data viewers)
- Features implementable with kernel HTTP APIs (block CRUD, SQL queries, file operations)
- Complex UIs benefiting from standard web tech (CodeMirror, D3.js, chart libraries, etc.)
- Isolated UI that doesn't need to integrate deeply with the editor

### HSPA is NOT suitable for:

- **Protyle editor interaction** — slash commands, custom block rendering, inline editing
- **SiYuan event bus** — listening to block changes, document opens, sync events
- **Main UI DOM manipulation** — modifying SiYuan's toolbar, sidebar, or panels

If a user request exceeds these boundaries, identify the limitation and decline rather than entering a futile loop.

---

## External Dependencies

1. **Avoid if possible** — prefer vanilla JS or the bundled Alpine.js/Vue 3
2. **Inform the user** when external deps are needed
3. **Prefer China-accessible CDN mirrors** (e.g., `cdn.bootcdn.net`, `unpkg.com`)
4. **Test reachability** and show fallback UI on failure:

```javascript
async function checkDependency(url, name) {
    try {
        const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
        return true;
    } catch {
        document.getElementById('app').innerHTML =
            `<p style="padding:2em;color:var(--theme-on-background)">` +
            `依赖 ${name} 加载失败，请检查网络连接</p>`;
        return false;
    }
}
```
