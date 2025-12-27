# Knowledge: Tree Model Philosophy & Patterns

**Topic**: Chat Tree Model Design Principles  
**Related Change**: `migrate-chat-tree-model`  
**Created**: 2025-12-27

## Overview

This document captures the philosophical principles and design patterns for the tree-based chat model migration. It serves as reference material for understanding the "why" behind architectural decisions.

---

## Core Philosophy

### The Three-Layer Mental Model

```
Reality (Storage)     ←→  Foundation (State)      ←→  Perception (UI)
━━━━━━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━━━━━
JSON with nodes{}         TreeModel with            Linear messages[]
& worldLine[]             reactive stores           derived via memo
```

**Key Insight**: Each layer has its own truth:
- **Storage** knows about persistence format
- **State** knows about tree structure
- **UI** knows about linear conversation flow

**Anti-Pattern**: Mixing these layers (e.g., UI directly manipulating tree nodes)

---

## Principle 1: Tree is Foundation, Not Facade

### ❌ Wrong Mental Model (Adapter Pattern)

```
Linear Array (Truth)
      ↓
Tree Adapter (Wrapper)
      ↓
UI consumes tree-like API
```

**Problem**: Treats tree as a "view" over array, perpetuates linear thinking

### ✅ Correct Mental Model (Projection Pattern)

```
Tree Structure (Truth)
      ↓
WorldLine (Active Path)
      ↓
messages() derived via Memo
```

**Benefit**: Tree is the reality, linear view is just one perspective

**Analogy**: File system
- **Tree**: Actual directory structure on disk
- **WorldLine**: Current working directory path
- **messages()**: `ls` output (snapshot of path contents)

---

## Principle 2: Reactive Derivation, Not Synchronization

### ❌ Wrong Approach (Sync Pattern)

```typescript
// Maintain both array and tree, keep in sync
const messages = useStoreRef<Message[]>([]);
const tree = useTreeModel();

// On tree change, sync to array
tree.onChange(() => {
    messages.set(tree.toArray());
});
```

**Problems**:
- Double storage
- Sync bugs
- Unclear source of truth

### ✅ Correct Approach (Derived State)

```typescript
// Tree is only storage
const tree = useTreeModel();

// Messages is computed, not stored
const messages = createMemo(() => 
    tree.worldLine().map(id => tree.nodes()[id])
);
```

**Benefits**:
- Single source of truth
- Cannot desync (mathematically)
- SolidJS optimizes updates

**SolidJS Insight**: Memos are "live queries" not "cached copies"

---

## Principle 3: Encapsulation at the Right Level

### Layer Responsibilities

| Layer | Knows About | Exposes |
|-------|-------------|---------|
| **TreeModel** | nodes{}, worldLine[], tree ops | Tree CRUD, messages() memo |
| **ChatSession** | config, communication, lifecycle | Convenience APIs, history mgmt |
| **UI Components** | User interaction | - |

### Anti-Pattern: Leaky Abstractions

```typescript
// ❌ Bad: UI knows about tree structure
<button onClick={() => {
    const parentId = message.parent;
    switchToNode(parentId);
}}>
```

```typescript
// ✅ Good: UI uses semantic operations
<button onClick={() => {
    navigateToParent(message.id);
}}>
```

**Rationale**: If we change tree structure (e.g., add grandparent pointers), UI shouldn't break

---

## Principle 4: Version vs Branch Clarity

### Version (Horizontal Exploration)

**Semantic**: "Same question, different answers"

**Use Cases**:
- Compare GPT-4 vs Claude response
- Temperature variation (creative vs precise)
- Retry after error

**Structure**:
```
Node A
 ├─ Version 1 (GPT-4)
 ├─ Version 2 (Claude)
 └─ Version 3 (Gemini)
```

**UI Pattern**: Dropdown or tabs on same message

### Branch (Vertical Exploration)

**Semantic**: "Different questions, diverging conversations"

**Use Cases**:
- "What if I had asked X instead?"
- Exploring alternative solution paths
- Backtracking to try different approach

**Structure**:
```
Node A (shared history)
 ├─ Child B (path 1) → ...
 └─ Child C (path 2) → ...
```

**UI Pattern**: Branch indicator, thread switcher

### Why Separate?

**Cognitive Load**: Versions = compare answers; Branches = explore questions

**Implementation**: Versions don't create nodes, branches do

---

## Design Pattern: Immutable Updates with SolidJS

### Why Immutability?

1. **Reactivity**: SolidJS tracks changes via reference equality
2. **Time Travel**: Undo/redo requires snapshots
3. **Debugging**: Clear mutation points
4. **Concurrency**: Easier to reason about

### Pattern: Copy-on-Write

```typescript
const updateNode = (id: string, updates: Partial<Node>) => {
    batch(() => {
        nodes.update(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                ...updates
            }
        }));
    });
};
```

**Key Elements**:
- `batch()` - Single reactivity update
- Spread operators - Shallow copy
- Return new object - Immutability

### When to Batch?

**Always batch** when multiple store updates happen together:

```typescript
// ❌ Bad: Multiple reactive updates
nodes.update(/* ... */);
worldLine.update(/* ... */);
rootId.set(/* ... */);

// ✅ Good: Single reactive pulse
batch(() => {
    nodes.update(/* ... */);
    worldLine.update(/* ... */);
    rootId.set(/* ... */);
});
```

**Effect**: UI updates once, not three times

---

## Design Pattern: Typed Accessor Functions

### Problem: V1/V2 Structure Differences

V1 and V2 access same logical data differently:

```typescript
// V1: Direct
const author = item.author;

// V2: Via version
const author = item.versions[item.currentVersionId].author;
```

### Solution: Generic Accessors

```typescript
// Abstraction layer
const getPayload = (item: Item, prop: 'author') => {
    // Implementation swappable
};

// Usage (same for V1/V2)
const author = getPayload(item, 'author');
```

### Benefits

1. **Localized Changes**: Migration happens in one file (`msg-item.ts`)
2. **Type Safety**: `prop` is typed, catches typos
3. **Testability**: Mock accessors for tests
4. **Documentation**: Accessor name explains purpose

### Anti-Pattern: Helper Explosion

```typescript
// ❌ Bad: Function per property
const getAuthor = (item) => ...;
const getTimestamp = (item) => ...;
const getToken = (item) => ...;
// ... 20 more functions
```

**Problem**: Scales poorly, duplicates logic

```typescript
// ✅ Good: Generic accessor
const getPayload = (item, prop) => ...;

// Call sites
getPayload(item, 'author')
getPayload(item, 'timestamp')
getPayload(item, 'token')
```

**Benefit**: Single implementation, type-safe via generics

---

## Performance Pattern: Memoization Strategy

### Hot Path Optimization

**Problem**: Repeated version lookups in render

```typescript
// ❌ Bad: Lookup on every access
<div>
    <p>{getPayload(item(), 'author')}</p>
    <p>{getPayload(item(), 'timestamp')}</p>
    <p>{getMessageProp(item(), 'content')}</p>
    {/* 3× version lookup! */}
</div>
```

**Solution**: Memoize active version

```typescript
const MessageCard = (props: { item: Accessor<Node> }) => {
    const version = createMemo(() => 
        props.item().versions[props.item().currentVersionId]
    );
    
    return (
        <div>
            <p>{version()?.author}</p>
            <p>{version()?.timestamp}</p>
            <p>{version()?.message.content}</p>
            {/* 1× lookup, cached */}
        </div>
    );
};
```

**Tradeoff**: More code vs fewer hash lookups (worth it for hot paths)

### When to Memoize?

**Yes**:
- Render-heavy components (message cards, lists)
- Computed properties used multiple times
- Expensive derivations (filtering, sorting)

**No**:
- One-time access (initialization)
- Already fast operations (direct field access)
- Premature optimization (measure first)

---

## Migration Pattern: Commented Dual Implementation

### Strategy

Keep both implementations during transition:

```typescript
export function accessor(item, prop) {
    // V1 implementation (ACTIVE)
    return item[prop];

    // V2 implementation (COMMENTED, ready to activate)
    // const payload = item.versions?.[item.currentVersionId];
    // return payload?.[prop];
}
```

### Activation Process

1. **Verify isolation**: All code uses accessor (grep for direct access)
2. **Test V1**: Run full test suite with V1 active
3. **Switch**: Uncomment V2, comment V1
4. **Test V2**: Run tests again
5. **Compare**: Ensure behavior identical
6. **Commit**: Remove V1, keep V2

### Benefits

- **Side-by-side comparison** during code review
- **Easy rollback** if issues found
- **Clear migration boundary** (visible in diff)
- **Documentation** of what changed

### Alternative Considered: Runtime Switch

```typescript
const USE_V2 = false;  // Feature flag

export function accessor(item, prop) {
    if (USE_V2) {
        // V2 logic
    } else {
        // V1 logic
    }
}
```

**Rejected because**:
- Runtime overhead (branch on every call)
- Harder to remove V1 later (entangled code)
- Confusing (which path is "real"?)

**Comment approach is cleaner**: Dead code obviously dead

---

## Testing Philosophy

### Test the Contract, Not the Implementation

```typescript
// ❌ Bad: Tests tree structure directly
test('worldLine is array of IDs', () => {
    expect(Array.isArray(tree.worldLine())).toBe(true);
});

// ✅ Good: Tests observable behavior
test('messages() reflects worldLine order', () => {
    tree.appendNode(node1);
    tree.appendNode(node2);
    expect(tree.messages()).toEqual([node1, node2]);
});
```

**Rationale**: If we change worldLine to Set, first test breaks; second still valid

### Test Invariants

Critical properties that must always hold:

```typescript
test('tree invariant: all worldLine nodes exist', () => {
    const nodes = tree.nodes();
    const worldLine = tree.worldLine();
    
    worldLine.forEach(id => {
        expect(nodes[id]).toBeDefined();
    });
});

test('tree invariant: parent-child consistency', () => {
    const nodes = tree.nodes();
    
    Object.values(nodes).forEach(node => {
        node.children.forEach(childId => {
            expect(nodes[childId].parent).toBe(node.id);
        });
    });
});
```

**Value**: Catch bugs that break fundamental assumptions

---

## Common Pitfalls & Solutions

### Pitfall 1: Forgetting `batch()`

**Symptom**: UI flickers, performance issues

**Cause**:
```typescript
// Multiple reactive updates
worldLine.update(/* ... */);  // UI updates
nodes.update(/* ... */);      // UI updates again
```

**Fix**:
```typescript
batch(() => {
    worldLine.update(/* ... */);
    nodes.update(/* ... */);
});  // UI updates once
```

### Pitfall 2: Mutating Memo Result

**Symptom**: Mysterious reactivity bugs

**Cause**:
```typescript
const messages = createMemo(() => tree.worldLine().map(/*...*/));

// Later...
messages().push(newMsg);  // ❌ Mutates memo output!
```

**Fix**:
```typescript
// Don't mutate derived state
// Use tree methods instead
tree.appendNode(newMsg);
```

### Pitfall 3: Using Adapter When Composition Works

**Symptom**: Unnecessary indirection, confusing APIs

**Anti-Pattern**:
```typescript
// Creating adapter to make tree look like array
const arrayAdapter = {
    get: (index) => tree.getNodeAt(index),
    push: (item) => tree.appendNode(item),
    // ... 20 more methods
};
```

**Better**:
```typescript
// Direct composition
const hooks = {
    messages: tree.messages,  // Just re-export
    getNode: tree.getNodeById,
    append: tree.appendNode,
};
```

**Principle**: Don't fight the abstraction, embrace it

---

## References

### SolidJS Reactivity

- createMemo: https://www.solidjs.com/docs/latest/api#createMemo
- batch: https://www.solidjs.com/docs/latest/api#batch
- Fine-grained reactivity: https://www.solidjs.com/guides/reactivity

### Design Patterns

- Immutability: https://en.wikipedia.org/wiki/Immutable_object
- Copy-on-Write: https://en.wikipedia.org/wiki/Copy-on-write
- Accessor Pattern: https://en.wikipedia.org/wiki/Accessor_pattern

### Project-Specific

- User philosophy: `openspec/user-draft/archive/[251226]-迁移进展中.md`
- Previous encapsulation: Git `bf9c409f`, `7834e299`

---

## Version History

- **2025-12-27**: Initial knowledge capture during proposal phase
