import React, { createContext, useContext, useMemo } from 'react';
import { getCacheStorage } from '../../platform/storage';

export interface QueryContextValue {
  invalidateNamespace: (prefix: string) => void;
  clearAllCache: () => void;
}

const QueryContext = createContext<QueryContextValue>({
  invalidateNamespace: () => undefined,
  clearAllCache: () => undefined,
});

export const QueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useMemo<QueryContextValue>(
    () => ({
      invalidateNamespace: (prefix: string) => {
        getCacheStorage().remove(prefix);
      },
      clearAllCache: () => {
        getCacheStorage().clearAll();
      },
    }),
    []
  );

  return <QueryContext.Provider value={value}>{children}</QueryContext.Provider>;
};

export function useAppQuery(): QueryContextValue {
  return useContext(QueryContext);
}
