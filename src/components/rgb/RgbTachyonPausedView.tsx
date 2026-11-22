import Hero68Preview from '../Hero68Preview';
import { useI18n } from '../../i18n';

export function RgbTachyonPausedView() {
  const { tr } = useI18n();
  return (
    <div className="page settings-page rgb-settings-page page-enter">
      <div className="settings-hero">
        <div>
          <h1>{tr('RGB Settings')}</h1>
          <p>{tr('RGB is paused while Tachyon Mode is enabled.')}</p>
        </div>
        <span className="rgb-basic-badge">{tr('Tachyon Mode')}</span>
      </div>
      <div className="rgb-preview-stage">
        <Hero68Preview selectedKeys={new Set()} onToggleKey={() => {}} selectionEnabled={false} />
      </div>
      <section className="settings-card">
        <h2>{tr('Brightness')} · 0%</h2>
        <p>
          {tr(
            'Key and side lighting, Custom Effects and Rhythm Sync are off. Turn off Tachyon Mode to use RGB again.'
          )}
        </p>
      </section>
    </div>
  );
}
