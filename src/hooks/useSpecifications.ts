import { Jinaga, SpecificationOf } from 'jinaga';
import * as React from 'react';
import { useSpecification } from './useSpecification';

type ProjectionsOf<TCompoundSpecification> = {
  [K in keyof TCompoundSpecification]: TCompoundSpecification[K] extends SpecificationOf<unknown, infer TProjection> ? TProjection[] : never;
};

export interface CompoundSpecificationResult<TCompoundProjection> {
  loading: boolean;
  data: TCompoundProjection | null;
  error: Error | null;
  clearError: () => void;
}

export function useSpecifications<TGiven, TCompoundSpecification extends { [key: string]: SpecificationOf<unknown, unknown>; }>(
  j: Jinaga,
  specifications: TCompoundSpecification,
  given: TGiven): CompoundSpecificationResult<ProjectionsOf<TCompoundSpecification>> {
  let compoundLoading = false;
  let compoundData: any | null = {};
  let compoundError: Error | null = null;
  const compoundClearError: (() => void)[] = [];

  for (const key in specifications) {
    const specification = specifications[key];
    const { loading, data, error, clearError } = useSpecification(j, specification, given);
    compoundLoading = compoundLoading || loading;
    if (data === null) {
      compoundData = null;
    }
    else if (compoundData !== null) {
      compoundData[key] = data;
    }
    compoundError = compoundError || error;
    compoundClearError.push(clearError);
  }

  const clearError = React.useCallback(() => {
    compoundClearError.forEach(clear => clear());
  }, []);

  return {
    loading: compoundLoading,
    data: compoundData,
    error: compoundError,
    clearError
  };
}
