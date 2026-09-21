import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useStore } from '../store';
import { languageOf, translate, translateValue, type Language } from './core';
type I18n = { lang: Language; tr: <T>(value: T) => T; t: (key: string, values?: Record<string, string | number>) => string };
const Context = createContext<I18n>({lang:'fr', tr: value => value, t: key => key});
export function I18nProvider({children}: {children: ReactNode}) {
  const {s} = useStore();
  const lang = languageOf(s.lang);
  const value = useMemo<I18n>(() => ({lang, tr: <T,>(v:T) => translateValue(v,lang), t:(key,values) => translate(key,lang,values)}), [lang]);
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }, [lang]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useI18n = () => useContext(Context);
