import { Jinaga, MakeObservable, SpecificationOf, computeObjectHash } from 'jinaga';
import { hashSymbol } from 'jinaga/dist/fact/hydrate';
import * as React from 'react';

export type ProjectionOf<TSpecification> = TSpecification extends SpecificationOf<unknown, infer TProjection> ? TProjection : never;
type CacheState = 'uninitialized' | 'loading' | 'ready';
type NullableElements<TGiven extends unknown[]> = TGiven extends [infer First, ...infer Rest] ? [First | null, ...NullableElements<Rest>] : TGiven;

// The Observer handle returned by both j.watch and j.subscribe. Derived from the
// public Jinaga API rather than a deep import so it stays valid as jinaga evolves.
type ObserverHandle = ReturnType<Jinaga['watch']>;

export interface SpecificationResult<TProjection> {
  loading: boolean;
  data: TProjection[] | null;
  error: Error | null;
  clearError: () => void;
}

export function useSpecification<TGiven extends unknown[], TProjection>(j: Jinaga, specification: SpecificationOf<TGiven, TProjection>, ...given: NullableElements<TGiven>): SpecificationResult<TProjection> {

  const [projections, setProjections] = React.useState<TProjection[]>([]);
  const [state, setState] = React.useState<CacheState>('uninitialized');
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    // Wait until all givens are specified.
    if (given.some(g => g === null))
      return;

    const nonNullGiven = given as TGiven;
    const observer = j.watch(specification, ...nonNullGiven, createOnAdded<TProjection>(setProjections));
    manageState(observer, setState, setError);
    return () => {
      setState('uninitialized');
      setProjections([]);
      setError(null);
      observer.stop();
    };
  }, [...factHashes(given), specification, setProjections, setState, setError]);

  const clearError = React.useCallback(() => setError(null), [setError]);
  const loading = state === 'loading';
  const data = (state === 'ready' && !error) ? projections : null;
  return { loading, data, error, clearError };
}

/**
 * Like {@link useSpecification}, but uses `j.subscribe` instead of `j.watch` so that
 * matching facts are pushed from the replicator in real time.
 *
 * Connection note: each subscription holds one persistent streaming HTTP connection
 * open per distinct feed produced by the specification (a single specification can fan
 * out to several feeds). Identical feeds are shared and reference-counted by jinaga, so
 * the cost is the number of distinct feeds across all live subscriptions, not the number
 * of hooks. Because browsers cap concurrent connections per origin at ~6 over HTTP/1.1 —
 * and those held-open streams can starve the `load` requests that fetch the underlying
 * facts — the replicator SHOULD be served over HTTP/2 (or HTTP/3) in production, where
 * streams are multiplexed over a single connection (~100 concurrent streams). See the
 * README for details.
 */
export function useSubscription<TGiven extends unknown[], TProjection>(j: Jinaga, specification: SpecificationOf<TGiven, TProjection>, ...given: NullableElements<TGiven>): SpecificationResult<TProjection> {

  const [projections, setProjections] = React.useState<TProjection[]>([]);
  const [state, setState] = React.useState<CacheState>('uninitialized');
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    // Wait until all givens are specified.
    if (given.some(g => g === null))
      return;

    const nonNullGiven = given as TGiven;
    const observer = j.subscribe(specification, ...nonNullGiven, createOnAdded<TProjection>(setProjections));
    manageState(observer, setState, setError);
    return () => {
      setState('uninitialized');
      setProjections([]);
      setError(null);
      observer.stop();
    };
  }, [...factHashes(given), specification, setProjections, setState, setError]);

  const clearError = React.useCallback(() => setError(null), [setError]);
  const loading = state === 'loading';
  const data = (state === 'ready' && !error) ? projections : null;
  return { loading, data, error, clearError };
}

function createOnAdded<TProjection>(setProjections: React.Dispatch<React.SetStateAction<TProjection[]>>) {
  return (projection: MakeObservable<TProjection>) => {
    const element = removeObservables(projection);
    const elementKey = computeElementKey(element);
    setProjections(list => [...list, element]);

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
  };
}

function manageState(observer: ObserverHandle, setState: React.Dispatch<React.SetStateAction<CacheState>>, setError: React.Dispatch<React.SetStateAction<Error | null>>) {
  observer.cached()
    .then(cacheReady => {
      if (cacheReady) {
        setState('ready');
      } else {
        setState('loading');
        observer.loaded()
          .catch(e => setError(e))
          .finally(() => setState('ready'));
      }
    });
}

function factHashes(facts: any[]): string[] {
  return facts.map(f => f ? Jinaga.hash(f) : '');
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
                return [...list, elementWithoutObservables];
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
