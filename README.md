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
