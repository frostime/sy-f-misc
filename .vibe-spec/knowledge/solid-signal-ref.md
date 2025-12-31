# @frostime/solid-signal-ref

[frostime/solid-signal-ref](https://github.com/frostime/solid-signal-ref/tree/main)

A tiny utility to make using **SolidJS signals and stores** more ergonomic.

## Exports

```ts
import {
  // signals
  useSignalRef,
  createSignalRef,
  wrapSignalRef,
  type ISignalRef,

  // stores
  useStoreRef,
  createStoreRef,
  wrapStoreRef,
  type IStoreRef,
} from '@frostime/solid-signal-ref';
```

* `useSignalRef` / `createSignalRef` – create a ref from an initial value (wraps `createSignal`)
* `wrapSignalRef` – wrap an existing `Accessor` + `Setter` into a ref
* `useStoreRef` / `createStoreRef` – create a ref from an initial object (wraps `createStore`)
* `wrapStoreRef` – wrap an existing `Store` + `SetStoreFunction` into a ref


## Signal Ref (`useSignalRef`)

### Basic usage

Import and create a ref:

```ts
import { useSignalRef } from '@frostime/solid-signal-ref';

const count = useSignalRef<number>(0);
```

### Reading the value

```ts
count();        // Accessor style
count.value;    // Vue style
count.signal(); // The underlying Solid accessor (same as signal())
```

### Updating the value

```tsx
count(1);          // Setter style
count.value = 2;   // Vue style
count.update(3);   // Directly call the underlying setter
count.update(v => v * 2); // Functional update
```

### Derived signals

`derived` creates a memoized accessor (`Accessor<R>`):

```tsx
// Equivalent to: const doubled = () => count() * 2;
const doubled = count.derived(c => c * 2);

<p>Doubled count: {doubled()}</p>
```

### Unwrapped value

`unwrap` returns the current value with Solid’s `unwrap` applied.
For primitive values it’s just the current value;
for nested stores it will remove Solid’s proxies.

```tsx
const value = count.unwrap();
```

## Store Ref (`useStoreRef`)

`useStoreRef` is the store counterpart of `useSignalRef`.
It wraps Solid’s `createStore` and exposes a ref-like API.

### Basic usage

```ts
import { useStoreRef } from '@frostime/solid-signal-ref';

const state = useStoreRef({
  count: 0,
  items: [] as string[],
});
```

### Reading the store

```ts
state();         // returns the Store<T>
state.value;     // same as above (Vue style)
state.store;     // raw Store<T>

// Example:
state().count;
state.store.items.length;
```

Since `Store<T>` is a proxy, reading properties is reactive:

```tsx
<p>Count: {state().count}</p>
<p>Items: {state.store.items.length}</p>
```

### Updating the store

`IStoreRef` proxies `setStore` so you can use familiar patterns:

```ts
// Set a field
state('count', 1);

// Update a field based on previous value
state('count', c => c + 1);

// Shallow merge
state({ count: 2 });

// Updater function returning a partial object
state(prev => ({
  count: prev.count + 1,
}));
```

You can also use the underlying `update` (which is `SetStoreFunction<T>`):

```ts
state.update('items', items => [...items, 'new item']);
```

### Derived values from store

`derived` creates a memoized accessor from the current store:

```tsx
const state = useStoreRef({ count: 0, items: [] as string[] });

const summary = state.derived(s => `Count: ${s.count}, Items: ${s.items.length}`);

<p>{summary()}</p>
```

### Unwrapped store

`unwrap` returns a non-proxy snapshot of the store:

```ts
const plain = state.unwrap();
// plain is a normal object, not a Solid store proxy
```

## Examples

### Signal Ref example

```tsx
import { useSignalRef } from '@frostime/solid-signal-ref';
import { createMemo } from 'solid-js';

function App() {
  const count = useSignalRef(0);

  const odd = () => (count() % 2 === 1 ? 'Yes' : 'No');
  const wordCount = count.derived(c => `Word count: ${c.toString().length}`);

  const numberStr = createMemo(() => {
    const abs = Math.abs(count());
    if (abs < 1000) return abs.toString();
    if (abs < 1_000_000) return (abs / 1000).toFixed(1) + 'k';
    return (abs / 1_000_000).toFixed(1) + 'M';
  });

  return (
    <>
      <div class="card">
        <button onClick={() => count(count() + 1)}>
          {count()} + 1
        </button>
        <button onClick={() => { count.value -= 1; }}>
          {count.value} - 1
        </button>
        <button onClick={() => { count.update((c: number) => 10 * c); }}>
          {count.value} * 10
        </button>
        <button onClick={() => { count.value /= 10; }}>
          {count.value} / 10
        </button>
        <p>
          Is count odd? {odd()}; {wordCount()}; {numberStr()}
        </p>
      </div>
    </>
  );
}
```

### Store Ref example

```tsx
import { useStoreRef } from '@frostime/solid-signal-ref';

function TodoApp() {
  const todos = useStoreRef({
    list: [] as { id: number; title: string; done: boolean }[],
    nextId: 1,
  });

  const doneCount = todos.derived(s => s.list.filter(t => t.done).length);

  const addTodo = (title: string) => {
    todos.update('list', list => [
      ...list,
      { id: todos().nextId, title, done: false },
    ]);
    todos('nextId', id => id + 1);
  };

  const toggle = (id: number) => {
    todos.update('list', list =>
      list.map(t => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  return (
    <div>
      <p>Done: {doneCount()}</p>
      <ul>
        {todos().list.map(todo => (
          <li>
            <label>
              <input
                type="checkbox"
                checked={todo.done}
                onInput={() => toggle(todo.id)}
              />
              {todo.title}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
```