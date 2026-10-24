import { DistributionDeniedError, DistributionDiagnostic, Jinaga, MakeObservable, SpecificationOf, computeObjectHash } from 'jinaga';
import { hashSymbol } from 'jinaga/dist/fact/hydrate';
import * as React from 'react';

export type ProjectionOf<TSpecification> = TSpecification extends SpecificationOf<unknown, infer TProjection> ? TProjection : never;
type NullableElements<TGiven extends unknown[]> = TGiven extends [infer First, ...infer Rest] ? [First | null, ...NullableElements<Rest>] : TGiven;

/**
 * The most recent completed attempt failed.
 */
export interface SpecificationFailure {
  /**
   * Why the attempt failed. A distribution denial is a `DistributionDeniedError`.
   */
  error: Error;
  /**
   * Starts a new attempt for the same given. `null` when trying again cannot
   * change the answer: a structural distribution denial, or `not-authenticated`,
   * whose way out is signing in.
   */
  retry: (() => void) | null;
  /**
   * True from `retry()` until that attempt completes. A "Try again" control
   * reads it for its progress indicator. The rest of the result keeps
   * describing the failed attempt until the retry completes.
   */
  retrying: boolean;
}

/**
 * Three independent instructions to the UI. Render each field on its own, not
 * as an `if`/`else` chain: an early return on one field hides the others, such
 * as cached rows behind a failure.
 *
 * ```tsx
 * const { data, loading, failure } = useSpecification(j, spec, given);
 *
 * return <>
 *   {loading && <Spinner />}
 *   {failure && <Failure error={failure.error} onRetry={failure.retry} retrying={failure.retrying} />}
 *   {data === null ? null : data.length === 0 ? <EmptyState /> : <Rows rows={data} />}
 * </>;
 * ```
 */
export interface SpecificationResult<TProjection> {
  /**
   * What to show, always for the current given.
   *
   * - `null`: show nothing, and never a spinner. The answer hasn't arrived.
   * - `[]`: a real answer. Show the empty state. Any result can gain rows later.
   * - rows: show them. A failed refresh keeps the cached rows.
   */
  data: TProjection[] | null;
  /**
   * Whether to show an indicator. This is the only signal for one.
   *
   * True only while the first attempt for the current given is underway with
   * nothing to show. A background refresh of cached data leaves it false, so
   * cached rows appear without a flash of a spinner. A retry never sets it:
   * read `failure.retrying` instead.
   */
  loading: boolean;
  /**
   * Whether the most recent completed attempt failed, and the way out if one
   * exists. A retry keeps it until the retry completes, then replaces it with
   * the retry's outcome: `null` on success, or the new failure.
   */
  failure: SpecificationFailure | null;
}

interface State<TProjection> {
  // The given and specification this state belongs to.
  key: string;
  specification: unknown;
  rows: TProjection[];
  // True once there is an answer to show: from the local cache, or from a
  // completed fetch.
  settled: boolean;
  // True while a fetch is underway with nothing to show.
  fetching: boolean;
  // True once an attempt for this given has completed, whether it succeeded
  // or failed. A retry leaves it set, so a retry never shows as loading.
  completed: boolean;
  failure: SpecificationFailure | null;
  // Counts the retries. A change restarts the watch.
  attempt: number;
  // While a retry restarts the watch, the rows on screen stay there and the
  // new watch fills this list instead. It replaces them once it has an answer.
  buffer: TProjection[] | null;
}

const empty: SpecificationResult<never> = { data: null, loading: false, failure: null };

export function useSpecification<TGiven extends unknown[], TProjection>(j: Jinaga, specification: SpecificationOf<TGiven, TProjection>, ...given: NullableElements<TGiven>): SpecificationResult<TProjection> {

  const key = factHashes(given).join(',');
  const [state, setState] = React.useState<State<TProjection> | null>(null);
  const owned = state !== null && state.key === key && state.specification === specification;
  const attempt = owned ? state.attempt : 0;

  React.useEffect(() => {
    // Wait until all givens are specified.
    if (given.some(g => g === null)) {
      setState(null);
      return;
    }

    let active = true;
    const owns = (s: State<TProjection> | null): s is State<TProjection> =>
      s !== null && s.key === key && s.specification === specification;
    setState(s => owns(s) && s.failure?.retrying
      ? { ...s, fetching: false, rows: s.settled ? s.rows : [], buffer: s.settled ? [] : null }
      : { key, specification, rows: [], settled: false, fetching: false, completed: false, failure: null, attempt, buffer: null });

    // Only a failure can be retried, and only once at a time: a call while a
    // retry is underway leaves the attempt in flight alone. Every copy of this
    // function reads the same state, so the guard covers stale copies too.
    const retry = () => setState(s => owns(s) && s.failure !== null && s.failure.retry !== null && !s.failure.retrying
      ? { ...s, attempt: s.attempt + 1, failure: { ...s.failure, retrying: true } }
      : s);

    const update = (change: (s: State<TProjection>) => Partial<State<TProjection>>) => {
      if (!active) return;
      setState(s => s === null ? s : { ...s, ...change(s) });
    };
    const setProjections = (updater: (list: TProjection[]) => TProjection[]) =>
      update(s => s.buffer ? { buffer: updater(s.buffer) } : { rows: updater(s.rows) });
    const settled = (s: State<TProjection>) => ({ settled: true, rows: s.buffer ?? s.rows, buffer: null });

    // A structural distribution denial can't be fixed by trying again. Other
    // distribution decisions mean "no data yet", which is the empty state.
    let denial: Error | null = null;

    const nonNullGiven = given as TGiven;
    const watch = j.watch(specification, ...nonNullGiven, (projection: MakeObservable<TProjection>) => {
      const element = removeObservables(projection);
      const elementKey = computeElementKey(element);
      setProjections(list => insertSorted(list, element, computeElementKey, elementKey));

      const setChildProjections = <TKey extends keyof TProjection>(key: TKey, updater: (childList: TProjection[TKey]) => TProjection[TKey]) => {
        setProjections((list) => list.map((p) => {
          if (computeElementKey(p) === elementKey) {
            return {
              ...p,
              [key]: updater(p[key])
            };
          } else {
            return p;
          }
        }));
      };
      watchObservables(projection, setChildProjections);

      return (): void => {
        setProjections(list => list.filter(p => computeElementKey(p) !== elementKey));
      };
    });
    // Register before the fetch settles so no decision is missed; any
    // diagnostics already captured are replayed to this handler on registration.
    watch.onDiagnostic(diagnostic => {
      if (denial === null && isStructuralDenial(diagnostic)) {
        denial = new DistributionDeniedError([diagnostic]);
        const error = denial;
        update(() => ({ failure: { error, retry: null, retrying: false } }));
      }
    });

    watch.cached()
      .then(cacheReady => {
        if (cacheReady) {
          update(settled);
        } else {
          update(() => ({ fetching: true }));
        }
      });
    watch.loaded()
      .then(() => {
        update(s => denial === null
          ? { ...settled(s), fetching: false, completed: true, failure: null }
          : { fetching: false, completed: true });
      }, (error: Error) => {
        update(() => ({ fetching: false, completed: true, failure: { error, retry, retrying: false } }));
      });

    return () => {
      active = false;
      watch.stop();
    };
  }, [key, specification, attempt]);

  if (!owned || state === null) {
    return empty;
  }
  return {
    data: state.settled ? state.rows : null,
    loading: !state.completed && !state.settled && state.fetching,
    failure: state.failure
  };
}

// A distribution decision that a new attempt cannot change: a structural
// denial (a missing or narrowed-past rule), or `not-authenticated`, whose way
// out is signing in. A `reactive` or `principal-excluded` decision is not a
// failure: the replicator answered with no data, which is the empty state.
function isStructuralDenial(diagnostic: DistributionDiagnostic): boolean {
  if (diagnostic.cleared || diagnostic.reactive) return false;
  return diagnostic.code === 'no-matching-rule'
    || diagnostic.code === 'spec-more-restrictive-than-rule'
    || diagnostic.code === 'not-authenticated';
}

function factHashes(facts: any[]): string[] {
  return facts.map(f => f ? Jinaga.hash(f) : '');
}

function insertSorted<T>(list: T[], element: T, getKey: (item: T) => string, key: string = getKey(element)): T[] {
  const index = list.findIndex(item => getKey(item) > key);
  if (index === -1) {
    return [...list, element];
  }
  return [...list.slice(0, index), element, ...list.slice(index)];
}

function removeObservables<TProjection>(projection: MakeObservable<TProjection>): TProjection {
  return removeObservablesFromObject(projection) as TProjection;
}

function removeObservablesFromObject(projection: any): any {
  if (typeof projection === 'object') {
    // If it is an array, remove all observables from its elements.
    if (Array.isArray(projection)) {
      return projection.map(removeObservablesFromObject);
    }
    else {
      // If it is an object, remove all observables from its properties.
      const result: any = {};
      for (const key in projection) {
        const value = projection[key];
        // If the projection has a function called onAdded, then it is an observable collection.
        // Replace it with an array.
        if (typeof value === 'object' && typeof (value as any).onAdded === 'function') {
          result[key] = [];
        }
        else {
          result[key] = removeObservablesFromObject(value);
        }
      }
      // Preserve symbol properties (like hashSymbol) so facts can be identified after removing observables
      if (typeof Symbol !== 'undefined') {
        const symbols = Object.getOwnPropertySymbols(projection);
        for (const sym of symbols) {
          result[sym] = projection[sym];
        }
      }
      return result;
    }
  }

  // If it is not an object, it is a primitive value.
  return projection;
}

function getFactHash(element: any): string | null {
  // Try to access hashSymbol directly if available
  if (hashSymbol && element[hashSymbol]) {
    return element[hashSymbol];
  }
  
  // Fallback: search for the hash symbol using Object.getOwnPropertySymbols
  if (typeof Symbol !== 'undefined') {
    const symbols = Object.getOwnPropertySymbols(element);
    for (const sym of symbols) {
      if (sym.toString() === 'Symbol(hash)') {
        return element[sym];
      }
    }
  }
  
  return null;
}

function isFact(obj: any): boolean {
  // Check if object is a fact by verifying:
  // 1. It's an object (not null or primitive)
  // 2. It has a type property (facts always have a type property)
  // 3. It has the hash symbol (facts returned from FactProjection have hashSymbol set)
  return typeof obj === 'object' && 
         obj !== null && 
         typeof obj.type === 'string' &&
         getFactHash(obj) !== null;
}

/**
 * Computes a unique key for an element in a projection.
 * For facts (returned from FactProjection), uses the fact's hash directly.
 * For other projection types (composite, field, hash), computes a hash after removing array properties.
 * For primitive values, returns the string representation.
 */
function computeElementKey(element: any): string {
  // Check if element is a fact first - facts are uniquely identified by their hash
  if (isFact(element)) {
    const hash = getFactHash(element);
    if (hash) {
      return hash;
    }
  }
  
  // For non-fact objects (composite projections, etc.), use existing logic
  if (typeof element === 'object') {
    // If it is an object, remove all array properties.
    const immutable: any = {};
    for (const key in element) {
      if (!Array.isArray(element[key])) {
        immutable[key] = element[key];
      }
    }
    return computeObjectHash(immutable);
  }
  else {
    // If it is a primitive value, return its string representation.
    return element.toString();
  }
}

function watchObservables<TProjection>(projection: MakeObservable<TProjection>, setChildProjections: <TKey extends keyof TProjection>(key: TKey, updater: (childList: TProjection[TKey]) => TProjection[TKey]) => void) {
  if (typeof projection === 'object') {
    // Evaluate all properties.
    for (const key in projection) {
      const value = projection[key];
      if (typeof value === 'object') {
        // If the value has a function called onAdded, then it is an observable collection.
        // Call onAdded and prepare to set child projections.
        if (typeof (value as any).onAdded === 'function') {
          (value as any).onAdded((element: any) => {
            const elementWithoutObservables = removeObservables(element);
            const elementKey = computeElementKey(elementWithoutObservables);
            setChildProjections(key as keyof TProjection, (list: any) => {
              if (list.some((p: any) => computeElementKey(p) === elementKey)) {
                return list;
              }
              else {
                return insertSorted(list, elementWithoutObservables, computeElementKey, elementKey);
              }
            });

            // Recursively watch observables of children.
            const setGrandchildProjections: (key: string | number | symbol, updater: (childList: any) => any) => void = (childKey, updater) => {
              setChildProjections(key as keyof TProjection, (list: any) => list.map((p: any) => {
                if (computeElementKey(p) === elementKey) {
                  return {
                    ...p,
                    [childKey]: updater(p[childKey])
                  };
                }
                else {
                  return p;
                }
              })
              );
            };
            watchObservables(element, setGrandchildProjections);

            return () => {
              setChildProjections(key as keyof TProjection, (list: any) => list.filter((p: any) => computeElementKey(p) !== elementKey)
              );
            };
          });
        }
      }
    }
  }
}
