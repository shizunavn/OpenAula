import { LanguageSelect } from '../app/components/LanguageSelect';
import { Toggle } from '../app/components/Toggle';
import { useT, type LanguagePreference } from '../i18n';

export type InterfaceSettingsPageProps = {
  languagePreference: LanguagePreference;
  onSelectLanguage: (language: LanguagePreference) => void;
  showAdvancedPages: boolean;
  onShowAdvancedPagesChange: (enabled: boolean) => void;
  compactSidebar: boolean;
  onCompactSidebarChange: (enabled: boolean) => void;
  rememberSelection: boolean;
  onRememberSelectionChange: (enabled: boolean) => void;
};

export function InterfaceSettingsPage({
  languagePreference,
  onSelectLanguage,
  showAdvancedPages,
  onShowAdvancedPagesChange,
  compactSidebar,
  onCompactSidebarChange,
  rememberSelection,
  onRememberSelectionChange
}: InterfaceSettingsPageProps) {
  const tr = useT();

  return (
    <div className="page settings-page page-enter">
      <div className="settings-hero">
        <div>
          <h1>{tr('Interface')}</h1>
          <p>
            {tr(
              'OpenAula interface preferences. Every option on this page has an immediate UI effect.'
            )}
          </p>
        </div>
      </div>
      <section className="selector-page-grid">
        <article className="settings-card interface-only-card">
          <div className="settings-card-head">
            <h2>{tr('General')}</h2>
            <p>{tr('These preferences change the app interface and are saved in this browser.')}</p>
          </div>
          <div className="setting-line">
            <div>
              <strong>{tr('Language')}</strong>
              <p>{tr('Choose the display language used by OpenAula.')}</p>
            </div>
            <LanguageSelect
              value={languagePreference}
              onChange={onSelectLanguage}
              label={tr('Language')}
            />
          </div>
          <div className="setting-line">
            <div>
              <strong>{tr('Show advanced pages')}</strong>
              <p>
                {tr(
                  'Show Hall Stream, Gamepad, and advanced device controls. Turning this off hides them immediately.'
                )}
              </p>
            </div>
            <Toggle
              checked={showAdvancedPages}
              onChange={onShowAdvancedPagesChange}
              label={tr('Show advanced pages')}
            />
          </div>
          <div className="setting-line">
            <div>
              <strong>{tr('Compact sidebar')}</strong>
              <p>{tr('Reduce spacing in the main sidebar for smaller screens.')}</p>
            </div>
            <Toggle
              checked={compactSidebar}
              onChange={onCompactSidebarChange}
              label={tr('Compact sidebar')}
            />
          </div>
          <div className="setting-line">
            <div>
              <strong>{tr('Remember last selected keys')}</strong>
              <p>
                {tr(
                  'Restore the currently selected keys after reloading OpenAula. Turning this off stops persisting the selection.'
                )}
              </p>
            </div>
            <Toggle
              checked={rememberSelection}
              onChange={onRememberSelectionChange}
              label={tr('Remember last selected keys')}
            />
          </div>
        </article>
      </section>
    </div>
  );
}

export default InterfaceSettingsPage;
