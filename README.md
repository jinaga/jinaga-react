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
import { model, Post, PostTitle, Site } from './model';
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
  const { data: posts, loading, failure } = useSpecification(j, postsInSite, site);

  return <>
    {loading && <div>Loading posts...</div>}
    {failure && <div>
      Couldn't load posts: {failure.error.message}
      {failure.retry && <button onClick={failure.retry} disabled={failure.retrying}>
        {failure.retrying ? 'Trying again...' : 'Try again'}
      </button>}
    </div>}
    {posts === null ? null : posts.length === 0 ? <div>No posts found.</div> :
      <ul>
        {posts.map(post =>
          <li key={post.hash}>{post.titles.join(', ')}</li>
        )}
      </ul>}
  </>;
}
```

## Rendering the result

`useSpecification` returns three fields. Each one answers a single UI question, and each can be read on its own:

```tsx
const { data, loading, failure } = useSpecification(j, spec, given);

return <>
  {loading && <Spinner />}
  {failure && <Failure error={failure.error} onRetry={failure.retry} retrying={failure.retrying} />}
  {data === null ? null : data.length === 0 ? <EmptyState /> : <Rows rows={data} />}
</>;
```

This structure is the canonical usage. Its rules:

- **`data === null` means show nothing, never a spinner.** The answer hasn't arrived yet.
- **`loading` is the only signal for an indicator.** It covers the first attempt for a given, and only while there is nothing to show.
- **A failure is an answer.** A retry keeps the result as it was until the retry completes. Its progress is `failure.retrying`, for the "Try again" control to show if you want it shown.
- **`[]` is a real answer and shows the empty state.**
- **The three fields are rendered independently, not as an `if`/`else` chain.** An early return on one field hides the others, for example cached rows behind a failure.

### Habits from request-cache libraries mislead here

In TanStack Query, `isPending` is true from the first render until data arrives, so `if (isPending) return <Spinner />` is idiomatic there. Its equivalent here, `if (data === null) return <Spinner />`, shows a spinner for a moment before cached data appears. That flash is exactly what this hook is designed to avoid: Jinaga reads the local cache first, and `data` is `null` only until that read completes. Show a spinner when `loading` says so, and nothing otherwise.

Likewise, `if (failure) return <Failure />` hides the saved rows that are still in `data` when a background refresh fails. Render the failure next to the rows instead.

### Every combination means something

| `data` | `loading` | `failure` | The UI shows |
|---|---|---|---|
| `null` | `false` | `null` | Nothing (the answer hasn't arrived) |
| `null` | `true` | `null` | An indicator |
| `null` | `true` | set | The failure: a denial arrived before the first attempt finished |
| `null` | `false` | set | The failure, with a retry action if `retry` is set |
| `null` | `false` | set, `retrying` | The failure, and that it is trying again |
| rows | `false` | `null` | The rows |
| rows | `false` | set | Saved rows, and that a refresh failed |
| rows | `false` | set, `retrying` | Saved rows, a failed refresh, and a retry in progress |

`loading` is never `true` alongside rows, and a retry never sets it.

## Full API

### `useSpecification(jinaga, specification, ...given)`

Pass `null` for a given that isn't known yet. The hook waits, returning `{ data: null, loading: false, failure: null }`, until every given is set.

| Property  | Type                                                     | Meaning |
| :-------- | :------------------------------------------------------- | :------ |
| `data`    | `TProjection[] \| null`                                  | What to show. `null`: nothing. `[]`: the empty state. Always for the current given; a render after the given changes never shows the previous given's rows. A failed refresh keeps the cached rows. |
| `loading` | `boolean`                                                | Whether to show an indicator. `true` only while the first attempt for the current given is underway with nothing to show. A background refresh of cached data leaves it `false`, and a retry never sets it. |
| `failure` | `{ error: Error; retry: (() => void) \| null; retrying: boolean } \| null` | Whether the most recent completed attempt failed, and the way out if one exists. A retry keeps it until the retry completes, then replaces it with the retry's outcome: `null` on success, or the new failure. `retrying` is `true` from `retry()` until that attempt completes. |

### Failures and retrying

`failure.retry` starts a new watch for the same given. While it runs, the result keeps describing the failed attempt: `loading` stays `false`, `data` is unchanged, and the previous `failure` stays visible with `retrying: true`. When the retry completes, `failure` becomes `null` and `data` holds the answer in the same render, or `failure` holds the new error.

Calling `retry()` while a retry is underway does nothing; the attempt in flight continues. So an application can retry on its own, for example on each navigation, without canceling an attempt or flashing an indicator. Only the "Try again" control decides whether a retry is visible, by reading `failure.retrying`.

`failure.retry` is `null` when trying again cannot change the answer:

- **A structural distribution denial**, `no-matching-rule` or `spec-more-restrictive-than-rule`. The specification asks for more than a distribution rule shares. This is an authoring mistake to fix in the rules or the specification.
- **`not-authenticated`.** The way out is signing in, not trying again.

Both arrive as a `DistributionDeniedError`. Read its diagnostics to tell them apart, for example to route the user to a login page:

```tsx
import { DistributionDeniedError } from 'jinaga';

function Failure({ error, onRetry, retrying }: { error: Error, onRetry: (() => void) | null, retrying: boolean }) {
  const needsLogin = error instanceof DistributionDeniedError &&
    error.diagnostics.some(d => d.code === 'not-authenticated');

  return <div>
    {needsLogin ? <a href="/login">Sign in to see this</a> : <>Something went wrong: {error.message}</>}
    {onRetry && <button onClick={onRetry} disabled={retrying}>{retrying ? 'Trying again...' : 'Try again'}</button>}
  </div>;
}
```

Other errors, such as a refused connection, have a `retry`.

### Distribution

When a specification is covered by a `share ... with ...` distribution rule, the replicator decides what you may read. A `reactive` decision (the authorizing fact hasn't reached the replicator yet) or a `principal-excluded` denial (you're signed in but not in the authorized set) means the replicator answered with no data. That is the empty state, `data: []`, the same as any other empty result. Any result can gain rows later, and these do too if access is granted.

Distribution diagnostics remain developer tooling. Read them through `watch.onDiagnostic`, `j.onDistributionDiagnostic`, or the development console handler, not through the hook's result.

## Migrating from 6.x

Version 7 treats a failure as an answer. A retry no longer sets `loading`, and `failure` gains a required `retrying` field.

| 6.x | 7.x |
|---|---|
| `loading` is `true` during a retry | `loading` stays `false`. Read `failure.retrying`. |
| `retry()` during a retry restarts the watch | `retry()` during a retry does nothing. |
| `failure` is `{ error, retry }` | `failure` is `{ error, retry, retrying }`. Code that builds a `SpecificationFailure`, such as a test double, must set `retrying`. |

To migrate a component, show the "Try again" control's progress from `failure.retrying` instead of `loading`. Remove any workaround that kept the last rendered value through a retry.

## Migrating from 5.x

Version 6 replaces the result's `error`, `clearError`, `distributionPending` and `distributionDiagnostic` with a single `failure` field, and makes `data`, `loading` and `failure` independent.

| 5.x | 6.x |
|---|---|
| `error` | `failure?.error` |
| `clearError()` | Removed. To try again, call `failure.retry()`. Clearing the error used to show the empty state for a read that never answered. |
| `distributionPending` | Removed. The replicator's answer is the empty state: `data` is `[]`. |
| `distributionDiagnostic` | Removed. Use `watch.onDiagnostic`, `j.onDistributionDiagnostic` or the development console handler. To route to login, check `failure.error` for a `DistributionDeniedError` with code `not-authenticated`. |
| `data` is `null` whenever `error` is set | A failed refresh keeps the cached rows in `data`. |
| No retry; remount the component | `failure.retry()` |

To migrate a component:

1. Replace `if (data === null) return null; if (loading) return <Spinner />; ...` chains with the three independent expressions in [Rendering the result](#rendering-the-result).
2. Replace any "waiting for access" screen driven by `distributionPending` with the empty state.
3. Replace `clearError` buttons with a retry button bound to `failure.retry`, shown only when it isn't `null`.
4. Remove any workaround that keyed a child component by attempt to force a fresh watch, or that tagged results with the given that produced them.

## Earlier versions

Earlier versions of Jinaga-React used Mappings and Containers.
Those have been **deprecated**.
The current best practice is to use `useSpecification` exclusively for binding data into components.
