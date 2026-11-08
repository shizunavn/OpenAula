import { BRAND } from '../brand';
import { useT } from '../i18n';

export function HelpPage() {
  const tr = useT();

  return (
    <div className="page settings-page page-enter">
      <div className="settings-hero">
        <div>
          <h1>{tr('Help')}</h1>
          <p>
            {tr(
              'Connect your HERO68, save onboard settings, or set up the Windows background service.'
            )}
          </p>
        </div>
      </div>
      <section className="selector-page-grid">
        <article className="settings-card">
          <h2>{tr('Connect HERO68')}</h2>
          <p>
            {tr(
              'Open OpenAula in Chrome or Edge over HTTPS, click Connect, and select HERO68. Close other keyboard apps if the device is busy.'
            )}
          </p>
          <h2>{tr('Save onboard settings')}</h2>
          <p>
            {tr(
              'Choose a profile, edit your keys, then use Save to profile. Wait for readback confirmation; a failed save keeps your edits available for retry.'
            )}
          </p>
          <h2>{tr('Background Service')}</h2>
          <p>
            {tr(
              'Custom Effects, Rhythm Sync and Gamepad need the Windows background service. Open Settings > Background Service for setup. Gamepad also requires ViGEmBus.'
            )}
          </p>
          <h2>{tr('Documentation')}</h2>
          <p>
            <a href={BRAND.docsUrl} target="_blank" rel="noreferrer">
              {tr('Read the documentation')}
            </a>
            {' · '}
            <a href={BRAND.issuesUrl} target="_blank" rel="noreferrer">
              {tr('Report an issue')}
            </a>
          </p>
        </article>
      </section>
    </div>
  );
}

export default HelpPage;
