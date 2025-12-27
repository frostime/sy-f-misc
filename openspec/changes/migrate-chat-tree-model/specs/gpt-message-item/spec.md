# Capability: GPT Message Item Access

**Capability ID**: `gpt-message-item`  
**Status**: Modified (V1 → V2)  
**Change**: `migrate-chat-tree-model`

## Overview

This capability provides type-safe accessor functions for reading and modifying message item properties, abstracting the underlying data structure.

---

## MODIFIED Requirements

### Requirement: Payload Property Access

**ID**: `gpt-msg-item-payload-access`  
**Previous**: Direct top-level access  
**Change**: Version-aware access via `versions[currentVersionId]`

#### Scenario: Read version-specific properties

**Given** a V2 message node with multiple versions  
**When** accessing payload properties (author, timestamp, token, etc.)  
**Then** system returns value from current active version  
**And** abstracts version lookup logic from caller

**V1 Implementation** (Deprecated):
```typescript
export function getPayload(item, prop) {
    return item[prop];  // Direct top-level access
}
```

**V2 Implementation** (Active):
```typescript
export function getPayload(item: IChatSessionMsgItemV2, prop) {
    const payload = item.versions?.[item.currentVersionId];
    return payload?.[prop];
}
```

**Validation**:
- Correct version accessed
- Returns undefined if version missing
- Type-safe

---

### Requirement: Message Content Access

**ID**: `gpt-msg-item-message-access`  
**Previous**: `item.message.content`  
**Change**: `item.versions[currentVersionId].message.content`

#### Scenario: Get message content from active version

**Given** a message node  
**When** getting message content  
**Then** system retrieves from current version's payload  
**And** handles multi-modal content correctly

**V1 Implementation** (Deprecated):
```typescript
export function getMessageProp(item, prop) {
    return item.message?.[prop];
}
```

**V2 Implementation** (Active):
```typescript
export function getMessageProp(item: IChatSessionMsgItemV2, prop) {
    const payload = item.versions?.[item.currentVersionId];
    return payload?.message?.[prop];
}
```

**Validation**:
- Works with string content
- Works with array content (multi-modal)
- Handles missing message gracefully

---

### Requirement: Metadata Property Access

**ID**: `gpt-msg-item-meta-access`  
**Previous**: Same as V2  
**Change**: None (compatible)

#### Scenario: Access tree and node metadata

**Given** a message node  
**When** accessing metadata (id, type, hidden, pinned, parent, children)  
**Then** system returns value directly from node  
**And** no version lookup needed

**Implementation** (Same for V1/V2):
```typescript
export function getMeta(item, prop) {
    return item[prop];  // Direct access, same level in V1 and V2
}
```

**Validation**:
- Backward compatible
- No changes needed

---

## ADDED Requirements

### Requirement: Active Version Shorthand

**ID**: `gpt-msg-item-active-version`  
**Status**: New in V2

#### Scenario: Get entire current version payload

**Given** a message node with versions  
**When** caller needs full payload (not single property)  
**Then** system returns complete `IMessagePayload` for current version

**Implementation**:
```typescript
export function getActiveVersion(
    item: IChatSessionMsgItemV2
): IMessagePayload | undefined {
    return item.versions?.[item.currentVersionId];
}
```

**Validation**:
- Returns full payload object
- Returns undefined if no version
- Type-safe

---

### Requirement: Version Enumeration

**ID**: `gpt-msg-item-all-versions`  
**Status**: New in V2

#### Scenario: List all versions for comparison

**Given** a message node with multiple model responses  
**When** UI wants to show all versions  
**Then** system returns array of all payloads with metadata

**Implementation**:
```typescript
export function getAllVersions(
    item: IChatSessionMsgItemV2
): Array<{ id: string; payload: IMessagePayload }> {
    return Object.entries(item.versions || {}).map(([id, payload]) => ({
        id,
        payload
    }));
}
```

**Validation**:
- Returns all versions
- Includes version IDs
- Empty array if no versions

---

### Requirement: Multi-Version Detection

**ID**: `gpt-msg-item-has-versions`  
**Status**: New in V2

#### Scenario: Check if node has multiple model responses

**Given** a message node  
**When** checking version count  
**Then** system returns true if > 1 version exists

**Implementation**:
```typescript
export function hasMultipleVersions(
    item: IChatSessionMsgItemV2
): boolean {
    return Object.keys(item.versions || {}).length > 1;
}
```

**Validation**:
- Correctly counts versions
- Handles missing versions field

---

## MODIFIED Requirements (Setters)

### Requirement: Payload Property Update

**ID**: `gpt-msg-item-payload-update`  
**Previous**: Direct mutation  
**Change**: Immutable update of current version

#### Scenario: Update version-specific property

**Given** a message node  
**When** updating payload property (author, timestamp, etc.)  
**Then** system creates new node with updated current version  
**And** preserves immutability

**V1 Implementation** (Deprecated):
```typescript
export function setPayload(item, prop, value) {
    return { ...item, [prop]: value };
}
```

**V2 Implementation** (Active):
```typescript
export function setPayload(
    item: IChatSessionMsgItemV2,
    prop: PayloadProps,
    value: any
): IChatSessionMsgItemV2 {
    const versionId = item.currentVersionId;
    if (!versionId || !item.versions) return item;
    
    return {
        ...item,
        versions: {
            ...item.versions,
            [versionId]: {
                ...item.versions[versionId],
                [prop]: value
            }
        }
    };
}
```

**Validation**:
- Immutable (returns new object)
- Only updates current version
- Preserves other versions
- Type-safe

---

## REMOVED Requirements

### Requirement: Direct Property Mutation

**ID**: `gpt-msg-item-direct-mutation`  
**Status**: Removed  
**Reason**: Breaks reactivity, incompatible with V2

**Previous Behavior**:
```typescript
item.author = 'GPT-4';  // ❌ Direct mutation
item.message.content = 'New text';  // ❌ Nested mutation
```

**Migration Path**:
- Use `setPayload()` for immutable updates
- Use SolidJS store updates in TreeModel

---

## Implementation Notes

### Dual Implementation Strategy

During migration, both V1 and V2 implementations coexist as comments:

```typescript
/**
 * Get payload property
 * V1: item[prop]
 * V2: item.versions[item.currentVersionId][prop]
 */
export function getPayload(item, prop) {
    // V1 implementation (DEPRECATED)
    // return item[prop];

    // V2 implementation (ACTIVE)
    const payload = item.versions?.[item.currentVersionId];
    return payload?.[prop];
}
```

**Activation Process**:
1. Verify all callers use accessor (no direct access)
2. Run tests with V1
3. Uncomment V2, comment V1
4. Run tests with V2
5. Remove V1 completely

---

### Type Categories

Properties organized by access pattern:

```typescript
// Meta: Same level in V1/V2, no version lookup
type MetaProps = 'id' | 'type' | 'hidden' | 'pinned' | 'parent' | 'children';

// Payload: Version-specific in V2
type PayloadProps = 'author' | 'timestamp' | 'token' | 'usage' | 'time' | 'userPromptSlice';

// Message: Nested in payload
type MessageProps = 'role' | 'content' | 'name' | 'tool_calls' | 'tool_call_id';
```

**Usage**:
- `getMeta(item, 'type')` - Direct access
- `getPayload(item, 'author')` - Via currentVersion
- `getMessageProp(item, 'content')` - Via currentVersion.message

---

## Testing Requirements

### Unit Tests

1. **V2 Accessors**:
   - `getPayload()` retrieves from correct version
   - `getMessageProp()` handles nested access
   - `getMeta()` direct access works
   
2. **Version Helpers**:
   - `getActiveVersion()` returns full payload
   - `getAllVersions()` returns all payloads
   - `hasMultipleVersions()` counts correctly

3. **Setters**:
   - `setPayload()` immutable update
   - `setMessageProp()` nested update
   - Original object unchanged

4. **Edge Cases**:
   - Missing versions field
   - Invalid currentVersionId
   - Missing message property
   - Undefined values

### Integration Tests

1. **With TreeModel**:
   - Accessor functions work on tree nodes
   - Updates trigger reactivity
   - Type safety enforced

2. **With Migration**:
   - Accessors work on migrated V1 nodes
   - No runtime errors on legacy data

---

## Related Capabilities

- `gpt-chat-session` - Uses accessors for all node operations
- `gpt-persistence` - Loads nodes that accessors operate on

---

## Migration Impact

### Breaking Changes

**Internal API only** (these were never documented/public):
- Direct property access (was never recommended)
- Mutation (was never recommended)

### Safe Migration

All code already uses accessors (enforced in previous commits):
- Git: `7834e299` - Encapsulated item operations

**No call sites need updates** (already abstracted)

---

## Performance Considerations

### Access Overhead

| Pattern | V1 | V2 | Overhead |
|---------|----|----|----------|
| `getMeta(item, 'id')` | O(1) | O(1) | None |
| `getPayload(item, 'author')` | O(1) | O(1) hash + O(1) access | ~1-2ns |
| `getMessageProp(item, 'content')` | O(1) | O(1) hash + 2× O(1) access | ~2-4ns |

**Impact**: Negligible (< 5ns per access, well within noise)

### Memoization Strategy

For hot paths, memoize active version:

```typescript
const useMessageDisplay = (item: Accessor<Node>) => {
    const activeVersion = createMemo(() => 
        getActiveVersion(item())
    );
    
    // Avoid repeated version lookups
    const author = () => activeVersion()?.author;
    const content = () => activeVersion()?.message?.content;
    
    return { author, content };
};
```

---

## Future Enhancements

### Versioned Setters

Allow updating specific version (not just current):

```typescript
export function setPayloadVersion(
    item: IChatSessionMsgItemV2,
    versionId: string,
    prop: PayloadProps,
    value: any
): IChatSessionMsgItemV2 {
    // Update specific version, not current
}
```

**Not in scope for current change.**
