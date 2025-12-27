# Capability: GPT Message Persistence

**Capability ID**: `gpt-persistence`  
**Status**: Modified (V1 → V2)  
**Change**: `migrate-chat-tree-model`

## Overview

This capability handles saving and loading chat sessions to/from disk (JSON files) and browser storage (localStorage cache).

---

## MODIFIED Requirements

### Requirement: History Serialization Format

**ID**: `gpt-persistence-format`  
**Previous**: V1 linear array format  
**Change**: V2 tree structure format

#### Scenario: Save session to JSON

**Given** a chat session with tree structure  
**When** saving to JSON file  
**Then** system serializes as `IChatSessionHistoryV2`  
**And** includes schema version (`schema: 2`)  
**And** stores all nodes in `nodes` field  
**And** stores active path in `worldLine` field

**Format**:
```json
{
  "schema": 2,
  "type": "history",
  "id": "session-123",
  "title": "Conversation about...",
  "timestamp": 1234567890,
  "updated": 1234567999,
  "nodes": {
    "node-1": { "id": "node-1", "type": "message", ... },
    "node-2": { "id": "node-2", "type": "message", ... }
  },
  "rootId": "node-1",
  "worldLine": ["node-1", "node-2"]
}
```

**Validation**:
- Schema field present and correct
- All referenced nodes exist in `nodes`
- WorldLine IDs valid

---

### Requirement: Schema Detection

**ID**: `gpt-persistence-schema-detection`  
**Previous**: Not needed (single format)  
**Change**: Detect V1 vs V2 on load

#### Scenario: Load history with unknown version

**Given** a JSON file containing chat history  
**When** loading the file  
**Then** system detects schema version  
**And** identifies as V1 if `items` field present  
**And** identifies as V2 if `schema: 2` present

**Implementation**:
- Function: `detectHistorySchema(history)`
- Returns: `1 | 2`
- Logic: Check for presence of `schema` field and `nodes` vs `items`

**Validation**:
- Correctly identifies all V1 formats
- Correctly identifies all V2 formats
- Handles edge cases (empty, malformed)

---

## ADDED Requirements

### Requirement: Read-Time Migration

**ID**: `gpt-persistence-read-migration`  
**Status**: New in V2

#### Scenario: Automatically migrate V1 on load

**Given** a V1 chat history file  
**When** loading the file  
**Then** system detects V1 format  
**And** automatically converts to V2 in memory  
**And** does **not** write back to disk  
**And** returns V2 structure to caller

**Implementation**:
- Function: `getFromJson(path)` → `IChatSessionHistoryV2 | null`
- Pipeline:
  1. Read JSON
  2. Detect schema
  3. If V1, call `migrateHistoryV1ToV2()`
  4. Return V2

**Validation**:
- V1 files load successfully
- Migrated data matches V2 schema
- Disk file unchanged after load
- Re-loading produces same result (idempotent)

---

### Requirement: Migration Logging

**ID**: `gpt-persistence-migration-log`  
**Status**: New in V2

#### Scenario: Track migration events

**Given** migration of V1 history  
**When** conversion occurs  
**Then** system logs migration event  
**And** includes session ID, timestamp, success/failure

**Implementation**:
- Console log or dedicated migration log
- Format: `[Migration] V1→V2: session-123 (success)`

**Validation**:
- Logs visible during development
- No sensitive data leaked

---

## MODIFIED Requirements (Continued)

### Requirement: LocalStorage Caching

**ID**: `gpt-persistence-cache`  
**Previous**: Cache V1 format  
**Change**: Cache V2 format with migration

#### Scenario: Cache recent sessions for quick access

**Given** recently accessed chat sessions  
**When** caching to localStorage  
**Then** system stores V2 format  
**And** limits cache size to prevent quota overflow

**When** reading from cache  
**Then** system detects and migrates V1 entries  
**And** updates cache with V2 on next write

**Implementation**:
- Function: `listFromLocalStorage()` → `IChatSessionHistoryV2[]`
- Migrates V1 entries on read
- Stores V2 on write

**Validation**:
- Cache remains functional
- Old V1 caches still usable
- Quota limits respected

---

## REMOVED Requirements

None. All V1 capabilities preserved in V2 (with migration layer).

---

## Implementation Notes

### Migration Pipeline

```typescript
// json-files.ts
export const getFromJson = async (sessionId: string) => {
    const json = await readFile(path);
    const raw = JSON.parse(json);
    
    const schema = detectHistorySchema(raw);
    if (schema === 1) {
        // Auto-migrate in memory
        const v2 = migrateHistoryV1ToV2(raw);
        console.log(`[Migration] V1→V2: ${sessionId}`);
        return v2;
    }
    
    return raw as IChatSessionHistoryV2;
};

export const saveToJson = async (history: IChatSessionHistoryV2) => {
    // Always save as V2
    const json = JSON.stringify(history, null, 2);
    await writeFile(path, json);
};
```

### Backward Compatibility Strategy

- **Read**: Support both V1 and V2 (via migration)
- **Write**: Always V2
- **No Auto-Upgrade**: User must explicitly save to upgrade file

**Rationale**: 
- Prevents accidental data loss
- Allows rollback to older software versions
- User controls when upgrade happens (on edit)

---

## Testing Requirements

### Test Cases

1. **V1 Load**: Load known V1 file, verify V2 structure
2. **V2 Load**: Load V2 file, verify correct parsing
3. **Round-Trip**: Save V2, load V2, compare
4. **Migration Idempotency**: Migrate(Migrate(V1)) = Migrate(V1)
5. **Edge Cases**: Empty session, malformed JSON, missing fields
6. **Cache Behavior**: V1 cached, load, verify migration

### Performance

- Load V1 (1000 msgs): < 200ms (includes migration)
- Load V2 (1000 msgs): < 100ms (no migration)
- Save V2: < 50ms

---

## Related Capabilities

- `gpt-chat-session` - Consumes loaded history (see delta)
- `gpt-message-item` - Node structure (see delta)

---

## Migration Impact

### Breaking Changes

None. V1 files still load (via migration).

### Deprecations

- V1 write format (can still read, won't write)

### User Communication

When V1 migration occurs:
- Optional: Show notification "Session upgraded to V2"
- Log to console for debugging

---

## Future Considerations

### Export to V1 (Rollback)

If user needs to downgrade software:
- Provide `exportToV1()` function
- Collapses tree to single worldLine
- Loses branch data (warn user)

**Not implemented in current change**, but architecture supports it.
