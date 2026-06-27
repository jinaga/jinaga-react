# Jinaga React

**Jinaga-React** makes it easy to build reactive, offline-first applications in React using the Jinaga framework. It connects your domain model to your UI automatically, so you don't have to write custom fetch logic or manage subscriptions yourself.

## Installation

```bash
npm install jinaga jinaga-react
```

## Basic Usage

Use the `useSpecification` hook to bind a Jinaga specification to your component. This hook keeps your UI in sync with the current facts, including offline updates and real-time changes.

```tsx
import { useSpecification } from 'jinaga-react';
import { model, Post, Site } from './model';
import { j } from './jinaga-config';

const postsInSite = model.given(Site).match(site =>
  site.successors(Post, post => post.site)
    .select(post => ({
      hash: j.hash(post),
      titles: post.successors(PostTitle, title => title.post)
        .notExists(title => title.successors(PostTitle, next => next.prior))
        .select(title => title.value)
    }))
);

export function PostList({ site }: { site: Site }) {
  const { data: posts, loading } = useSpecification(j, postsInSite, site);

  if (posts === null) {
    return null; // Initial transient state: render nothing
  }

  if (loading) {
    return <div>Loading posts...</div>;
  }

  if (posts.length === 0) {
    return <div>No posts found.</div>;
  }

  return <ul>
    { data.map(post =>
      <li key={post.hash}>{post.titles.join(', ')}</li>
    ) }
  </ul>;
}
```

**Behavior summary:**
- `data === null`: Transient startup — show nothing to avoid flashes.
- `loading === true`: A network round-trip is underway.
- `data.length === 0`: No matching facts.
- Otherwise: Render the facts.

## Full API

### `useSpecification(jinaga, specification, parameters)`

The `useSpecification` hook returns an object with these properties:

| Property     | Type                    | Meaning                                                                   |
| :----------- | :---------------------- | :------------------------------------------------------------------------ |
| `data`       | `TProjection[] \| null` | The facts matching your specification. `null` during transient startup.   |
| `loading`    | `boolean`               | `true` when a network round-trip is underway and data is missing locally. |
| `error`      | `Error \| null`         | If an error occurs while loading, it appears here.                        |
| `clearError` | `() => void`            | A function you can call to clear the current error manually.              |

### `useSubscription(jinaga, specification, parameters)`

`useSubscription` has the **same signature and return shape** as `useSpecification`. The
difference is in how it stays up to date:

- `useSpecification` uses `jinaga.watch`. It loads matching facts once and then reacts to
  changes in the **local** store. It does not hold a connection open.
- `useSubscription` uses `jinaga.subscribe`. It opens a **persistent streaming connection**
  to the replicator so that matching facts are **pushed in real time** as other clients
  create them.

Use `useSubscription` when you need live updates from the server (for example, a feed that
multiple users edit concurrently). Use `useSpecification` when local reactivity is enough.

#### ⚠️ Serve the replicator over HTTP/2

Each subscription holds one streaming HTTP connection open **per distinct feed** produced by
the specification, and a single specification can fan out to several feeds. Jinaga
reference-counts feeds, so identical subscriptions share a connection — the cost is the
number of *distinct* feeds across all live subscriptions, not the number of hooks.

Browsers cap concurrent connections to a single origin at **~6 over HTTP/1.1**. Because the
held-open feed streams also compete with the `load` requests that fetch the underlying
facts, exhausting that pool can stall — or in the worst case deadlock — your app.

**Serve the Jinaga replicator over HTTP/2 (or HTTP/3) in production.** HTTP/2 multiplexes all
streams over a single connection (~100 concurrent streams), which removes the per-origin
connection limit as a practical concern. Any modern reverse proxy, CDN, or managed host
negotiates HTTP/2 by default. If you can only serve HTTP/1.1, prefer `useSpecification` and
keep the number of concurrent `useSubscription` hooks small.

## Handling Edge Cases

### 1. **Blank State on Startup**

During the very first render, `data` will be `null`, even if `loading` is `false`.  
This startup phase is extremely short. You should **render nothing** during this phase to avoid distracting flashes.

```tsx
if (data === null) {
  return null;
}
```

### 2. **Loading Spinner**

If `loading` is `true`, it means the app expects a network fetch.  
You may want to show a spinner *only* if this network delay becomes noticeable.

```tsx
if (loading) {
  return <Spinner />;
}
```

**Note:** Cached data will still be shown immediately if available — the user doesn't have to wait.

### 3. **Handling Errors**

If a network fetch is necessary and an error occurs, `error` will be set.
You can use this to show an error message.

```tsx
const { data, loading, error, clearError } = useSpecification(j, someSpec, {});

if (error) {
  return (
    <div>
      Error: {error.message}
      <button onClick={clearError}>Dismiss</button>
    </div>
  );
}
```

## Migration Notes

Earlier versions of Jinaga-React used Mappings and Containers.  
Those have been **deprecated**.  
The current best practice is to use `useSpecification` exclusively for binding data into components.
