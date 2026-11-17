import React, { createContext, useContext, useState } from 'react';
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
  const direction = getDirectionForLocale(locale);

  return (
    <LocalizationContext.Provider value={{ locale, direction, setLocale }}>
      {children}
    </LocalizationContext.Provider>
  );
};

export function useAppLocalization(): LocalizationContextValue {
  return useContext(LocalizationContext);
}
