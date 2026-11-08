import { useEffect, useMemo, useState } from 'react';
import type { RgbTab } from '../../components/RgbSettingsPage';
import { createTranslator, type LanguagePreference } from '../../i18n';
import { browserSuggestedLanguage, detectRegion } from '../../i18n/region';
import type { PersistedOpenHeroState } from '../../state/persistence';
export function useUiPreferences(persistedState: PersistedOpenHeroState | null | undefined) {
  const [activeRail, setActiveRail] = useState<'keyboard' | 'settings' | 'help'>(
    () => persistedState?.activeRail ?? 'keyboard'
  );
  const [activePage, setActivePage] = useState(() => persistedState?.activePage ?? 'quick');
  const [activeSettingsPage, setActiveSettingsPage] = useState(
    () => persistedState?.activeSettingsPage ?? 'general'
  );
  const [compactSidebar, setCompactSidebar] = useState(
    () => persistedState?.compactSidebar ?? false
  );
  const [showAdvancedPages, setShowAdvancedPages] = useState(
    () => persistedState?.showAdvancedPages ?? true
  );
  const [rememberSelection, setRememberSelection] = useState(
    () => persistedState?.rememberSelection ?? true
  );
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(
    () => persistedState?.languagePreference ?? browserSuggestedLanguage()
  );
  const [languageManuallySet, setLanguageManuallySet] = useState(
    () => persistedState?.languageManuallySet ?? false
  );
  const [languageRegionDetected, setLanguageRegionDetected] = useState(
    () => persistedState?.languageRegionDetected ?? false
  );
  const [switchSearch, setSwitchSearch] = useState(() => persistedState?.switchSearch ?? '');
  const [switchBrandFilter, setSwitchBrandFilter] = useState(
    () => persistedState?.switchBrandFilter ?? 'all'
  );
  const [rgbCustomEntry, setRgbCustomEntry] = useState(false);
  const [activeRgbTab, setActiveRgbTab] = useState<RgbTab>('onboard');
  const [quickPreviewMode, setQuickPreviewMode] = useState<
    'none' | 'actuation' | 'rapid' | 'deadzone'
  >('none');
  const [actuationPreviewWidth, setActuationPreviewWidth] = useState<number>();
  const resolvedLanguage = languagePreference;
  const tr = useMemo(() => createTranslator(resolvedLanguage), [resolvedLanguage]);
  useEffect(() => {
    document.documentElement.lang = resolvedLanguage;
  }, [resolvedLanguage]);
  useEffect(() => {
    if (languageManuallySet || languageRegionDetected) {
      return;
    }
    let cancelled = false;
    void detectRegion().then(result => {
      if (cancelled) {
        return;
      }
      setLanguagePreference(result.suggestedLanguage);
      setLanguageRegionDetected(true);
    });
    return () => {
      cancelled = true;
    };
  }, [languageManuallySet, languageRegionDetected]);
  function selectLanguage(language: LanguagePreference) {
    setLanguagePreference(language);
    setLanguageManuallySet(true);
    setLanguageRegionDetected(true);
  }
  return {
    activeRail,
    setActiveRail,
    activePage,
    setActivePage,
    activeSettingsPage,
    setActiveSettingsPage,
    compactSidebar,
    setCompactSidebar,
    showAdvancedPages,
    setShowAdvancedPages,
    rememberSelection,
    setRememberSelection,
    languagePreference,
    languageManuallySet,
    languageRegionDetected,
    resolvedLanguage,
    tr,
    selectLanguage,
    switchSearch,
    setSwitchSearch,
    switchBrandFilter,
    setSwitchBrandFilter,
    rgbCustomEntry,
    setRgbCustomEntry,
    activeRgbTab,
    setActiveRgbTab,
    quickPreviewMode,
    setQuickPreviewMode,
    actuationPreviewWidth,
    setActuationPreviewWidth
  };
}
