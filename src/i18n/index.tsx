import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { VI } from './locales/vi';

export type Language = 'en' | 'vi';
export type LanguagePreference = Language;
export type RegionGroup = 'VN' | 'OTHER';
export type TranslationVars = Record<string, string | number>;

function interpolate(text: string, vars?: TranslationVars) {
  if (!vars) {
    return text;
  }
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

export function createTranslator(language: Language) {
  return (text: string, vars?: TranslationVars) =>
    interpolate(language === 'vi' ? (VI[text] ?? text) : text, vars);
}

const I18nContext = createContext<{
  language: Language;
  tr: ReturnType<typeof createTranslator>;
}>({
  language: 'en',
  tr: createTranslator('en')
});

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(
    () => ({
      language,
      tr: createTranslator(language)
    }),
    [language]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).tr;
}
