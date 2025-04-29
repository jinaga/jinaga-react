# Jinaga React

Jinaga-React makes it easy to build reactive, offline-first applications in React using the Jinaga framework. It connects your domain model to your UI automatically, so you don’t have to write custom fetch logic or manage subscriptions yourself.

## Installation

```bash
npm install jinaga jinaga-react
```

## Getting Started

Before you can use useSpecification, you need a Jinaga instance connected to a replicator.
This allows your app to query facts locally and sync with a server.

Here’s a simple setup:

1. Create a Jinaga instance

```javascript
import { JinagaBrowser } from 'jinaga-browser';

export const j = new JinagaBrowser({
  httpEndpoint: "https://your-replicator.example.com/"
});
```

- Replace the URL with your replicator’s address.
- If you don’t have a replicator yet, you can run one locally using Jinaga Replicator.

Example local replicator (development only):

```bash
npx @jinaga/replicator
```

This will start a replicator at http://localhost:8080/.

2. Define your model

Create a file like model.ts that defines your types and specifications.

```javascript
import { predefine } from "jinaga";

export class Post {
  type = "Post" as const;
  constructor(
    public messageId: string,
    public content: string
  ) {}
}

export const postList = predefine(Post, j => j
  .match()
  .select()
  .orderBy(p => p.messageId)
);
```

- predefine lets you build queries declaratively.
- Specifications describe what facts you want to display.

3. Use useSpecification in your component

Now you can bind the specification into your UI:

```javascript
import { useSpecification } from 'jinaga-react';
import { j, postList } from './model';

export function PostList() {
  const { data: posts, loading } = useSpecification(j, postList, {});

  if (posts === null) {
    return null;
  }

  if (loading) {
    return <div>Loading posts...</div>;
  }

  return (
    <ul>
      {posts.map(post => (
        <li key={post.messageId}>{post.content}</li>
      ))}
    </ul>
  );
}
```

## Basic Usage

Use the useSpecification hook to bind a Jinaga specification to your component. This hook keeps your UI in sync with the current facts, including offline updates and real-time changes.

```javascript
import { useSpecification } from 'jinaga-react';
import { j, Post, postList } from './model';

export function PostList() {
  const { data: posts, loading } = useSpecification(j, postList, {});

  if (posts === null) {
    return null; // Initial transient state: render nothing
  }

  if (loading) {
    return <div>Loading posts...</div>;
  }

  if (posts.length === 0) {
    return <div>No posts found.</div>;
  }

  return (
    <ul>
      {posts.map(post => (
        <li key={post.messageId}>{post.content}</li>
      ))}
    </ul>
  );
}
```

Behavior summary:
- data === null: Transient startup — show nothing to avoid flashes.
- loading === true: A network round-trip is underway.
- data.length === 0: No matching facts.
- Otherwise: Render the facts.

## Parameters

You can pass parameters to a specification. If you pass objects, be sure they are stable across renders (using useMemo) to avoid unnecessary resubscriptions.

```javascript
import { useMemo } from 'react';
import { useSpecification } from 'jinaga-react';
import { j, postsByAuthor } from './model';

export function AuthorPosts({ author }) {
  const parameters = useMemo(() => ({ author }), [author]);
  const { data: posts } = useSpecification(j, postsByAuthor, parameters);

  if (posts === null) {
    return null;
  }

  return (
    <ul>
      {posts.map(post => (
        <li key={post.messageId}>{post.content}</li>
      ))}
    </ul>
  );
}
```

## Full API

useSpecification(jinaga, specification, parameters?)

The useSpecification hook returns an object with these properties:

| Property    | Type                  | Meaning                                                                 |
|-------------|-----------------------|-------------------------------------------------------------------------|
| data        | TProjection[] | null | The facts matching your specification. null during transient startup.   |
| loading     | boolean               | true when a network round-trip is underway and data is missing locally. |
| error       | Error | null          | If an error occurs during the loaded() promise, it appears here.        |
| clearError  | () => void            | A function you can call to clear the current error manually.            |

## Handling Edge Cases

1. Blank State on Startup

During the very first render, data will be null, even if loading is false.
This startup phase is extremely short. You should render nothing during this phase to avoid distracting flashes.

```javascript
if (data === null) {
  return null;
}
```

2. Loading Spinner

If loading is true, it means the app expects a network fetch.
You may want to show a spinner only if this network delay becomes noticeable.

```javascript
if (loading) {
  return <Spinner />;
}
```

Note: Cached data will still be shown immediately if available — the user doesn’t have to wait.

3. Handling Errors

In rare cases (such as replicator misconfiguration), you might encounter an error.

```javascript
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

Normally, applications can ignore error handling unless you’re debugging deep network issues.

## Migration Notes

Earlier versions of Jinaga-React used Mappings and Containers.
Those have been deprecated.
The current best practice is to use useSpecification exclusively for binding data into components.

## Example: Complex Component

```javascript
import { useSpecification } from 'jinaga-react';
import { j, Company, employeesOfCompany } from './model';

export function EmployeeList({ company }: { company: Company }) {
  const parameters = useMemo(() => ({ company }), [company]);
  const { data: employees, loading, error, clearError } = useSpecification(j, employeesOfCompany, parameters);

  if (employees === null) {
    return null;
  }

  if (error) {
    return (
      <div>
        Error loading employees: {error.message}
        <button onClick={clearError}>Retry</button>
      </div>
    );
  }

  if (loading) {
    return <div>Loading employees...</div>;
  }

  if (employees.length === 0) {
    return <div>No employees found.</div>;
  }

  return (
    <ul>
      {employees.map(employee => (
        <li key={employee.employeeId}>{employee.name}</li>
      ))}
    </ul>
  );
}
```

## Summary

Jinaga-React lets you build React apps that are:
- Offline-first: Local cache is primary.
- Live-updating: UI refreshes automatically as facts change.
- Declarative: You describe what you want, not how to load it.

Use useSpecification to make building reactive applications simple, clean, and powerful.

## Example Project Structure

Here’s a simple way to organize a Jinaga-React application:

```
src/
├── jinaga.ts           # Create and export your Jinaga instance
├── model/
│   ├── post.ts         # Define facts and specifications for Posts
│   └── user.ts         # (Optional) Define facts for Users
├── components/
│   ├── PostList.tsx    # React component using useSpecification
│   └── AuthorPosts.tsx # Another example component
├── App.tsx             # Main app layout
└── index.tsx           # React entry point
```

Key ideas:
- jinaga.ts: Your single source of the configured j instance.
- model/: Fact types and specifications organized by domain concepts.
- components/: React components, each connecting to specifications as needed.
- App.tsx: High-level routing, layouts, authentication, etc.

## Example jinaga.ts

```javascript
import { JinagaBrowser } from 'jinaga-browser';

export const j = new JinagaBrowser({
  httpEndpoint: "https://your-replicator.example.com/"
});
```

## Example model/post.ts

```javascript
import { predefine } from 'jinaga';

export class Post {
  type = "Post" as const;
  constructor(
    public messageId: string,
    public content: string
  ) {}
}

export const postList = predefine(Post, j => j
  .match()
  .select()
  .orderBy(p => p.messageId)
);
```

## Example components/PostList.tsx

```javascript
import { useSpecification } from 'jinaga-react';
import { j, postList } from '../model/post';

export function PostList() {
  const { data: posts, loading } = useSpecification(j, postList, {});

  if (posts === null) {
    return null;
  }

  if (loading) {
    return <div>Loading posts...</div>;
  }

  return (
    <ul>
      {posts.map(post => (
        <li key={post.messageId}>{post.content}</li>
      ))}
    </ul>
  );
}
```

This setup keeps your application modular, easy to extend, and closely aligned with Jinaga’s offline-first design.
