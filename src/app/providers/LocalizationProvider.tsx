import React, { createContext, useContext, useMemo, useState } from 'react';
import { LocaleCode, Direction, getDirectionForLocale } from '../../platform/localization';

export interface LocalizationContextValue {
  locale: LocaleCode;
  direction: Direction;
  setLocale: (locale: LocaleCode) => void;
}

const LocalizationContext = createContext<LocalizationContextValue>({
  locale: 'fa-IR',
  direction: 'rtl',
  setLocale: () => undefined,
});

export const LocalizationProvider: React.FC<{
  initialLocale?: LocaleCode;
  children: React.ReactNode;
}> = ({ initialLocale = 'fa-IR', children }) => {
  const [locale, setLocale] = useState<LocaleCode>(initialLocale);
  const value = useMemo<LocalizationContextValue>(
    () => ({ locale, direction: getDirectionForLocale(locale), setLocale }),
    [locale],
  );

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
};

export function useAppLocalization(): LocalizationContextValue {
  return useContext(LocalizationContext);
}
