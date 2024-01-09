import { Jinaga, MakeObservable, SpecificationOf, computeObjectHash } from 'jinaga';
import * as React from 'react';

export type ProjectionOf<TSpecification> = TSpecification extends SpecificationOf<unknown, infer TProjection> ? TProjection : never;
type CacheState = 'uninitialized' | 'loading' | 'ready';
type NullableElements<TGiven extends unknown[]> = TGiven extends [infer First, ...infer Rest] ? [First | null, ...NullableElements<Rest>] : TGiven;

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
    const watch = j.watch(specification, ...nonNullGiven, (projection: MakeObservable<TProjection>) => {
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
    });
    watch.cached()
      .then(cacheReady => {
        if (cacheReady) {
          setState('ready');
        } else {
          setState('loading');
          watch.loaded()
            .catch(e => setError(e))
            .finally(() => setState('ready'));
        }
      });
    return () => {
      setState('uninitialized');
      setProjections([]);
      setError(null);
      watch.stop();
    };
  }, [...factHashes(given), specification, setProjections, setState, setError]);

  const clearError = React.useCallback(() => setError(null), [setError]);
  const loading = state === 'loading';
  const data = (state === 'ready' && !error) ? projections : null;
  return { loading, data, error, clearError };
}

function factHashes(facts: any[]): string[] {
  return facts.map(f => f ? Jinaga.hash(f) : '');
}

function removeObservables<TProjection>(projection: MakeObservable<TProjection>): TProjection {
  return removeObservablesFromObject(projection) as TProjection;
}

function removeObservablesFromObject(projection: any): any {
  if (typeof projection === 'object') {
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
    return result;
  }

  // If it is not an object, it is a primitive value.
  return projection;
}

function computeElementKey(element: any): string {
  // The element is either an object or a primitive value.
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
