import {
  Activity,
  BookOpen,
  Bug,
  Cpu,
  ExternalLink,
  Keyboard,
  Layers,
  PlusCircle,
  SlidersHorizontal
} from 'lucide-react';
import { useI18n } from '../i18n';
import { BRAND } from '../brand';

export interface HelpPageProps {
  onOpenBackgroundService?: () => void;
  onOpenDiagnostics?: () => void;
  onOpenProfiles?: () => void;
}

function HelpPage({ onOpenBackgroundService, onOpenDiagnostics, onOpenProfiles }: HelpPageProps) {
  const { tr } = useI18n();
  return (
    <div className="page settings-page help-page page-enter">
      <div className="settings-hero">
        <div>
          <h1>{tr('Help')}</h1>
          <p>
            {tr(
              'Connect your keyboard, manage onboard profiles, set up the Windows background service, or report a bug / request a new board.'
            )}
          </p>
        </div>
      </div>

      <section className="help-quick-actions" aria-label={tr('Support and issue templates')}>
        <a
          className="help-action-card is-primary"
          href={BRAND.bugReportUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span className="help-action-icon">
            <Bug size={20} />
          </span>
          <span className="help-action-copy">
            <strong>
              {tr('Report a bug')}
              <ExternalLink size={14} />
            </strong>
            <span>
              {tr(
                'Opens the pre-selected GitHub Bug Report template. Only a short description is required.'
              )}
            </span>
          </span>
        </a>

        <a
          className="help-action-card is-accent"
          href={BRAND.addBoardUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span className="help-action-icon">
            <PlusCircle size={20} />
          </span>
          <span className="help-action-copy">
            <strong>
              {tr('Request keyboard support')}
              <ExternalLink size={14} />
            </strong>
            <span>
              {tr(
                'Opens the pre-selected Add a Board template to submit your model, firmware, and USB IDs.'
              )}
            </span>
          </span>
        </a>

        <a className="help-action-card" href={BRAND.docsUrl} target="_blank" rel="noreferrer">
          <span className="help-action-icon">
            <BookOpen size={20} />
          </span>
          <span className="help-action-copy">
            <strong>
              {tr('Read the documentation')}
              <ExternalLink size={14} />
            </strong>
            <span>
              {tr(
                'Guides for Custom RGB, Rhythm Sync, Gamepad, Advanced Keys, and protocol notes.'
              )}
            </span>
          </span>
        </a>
      </section>

      <div className="help-grid">
        <article className="settings-card help-card">
          <div className="help-card-head">
            <Keyboard size={20} />
            <h2>{tr('Connect HERO68')}</h2>
          </div>
          <p>
            {tr(
              'Open OpenAula in Chrome or Edge over HTTPS, click Connect, and select HERO68. Close other keyboard apps if the device is busy.'
            )}
          </p>
          <p className="help-card-detail">
            {tr(
              'Verified models include AULA HERO68, HERO84, HERO 68 XS (5 µm precision & 8K receiver), and WIN 68 HE MAX (XSYD 0x5C).'
            )}
          </p>
        </article>

        <article className="settings-card help-card">
          <div className="help-card-head">
            <Layers size={20} />
            <h2>{tr('Save & reset onboard profiles')}</h2>
          </div>
          <p>
            {tr(
              'Choose a profile, edit your keys, then use Save to profile. Wait for readback confirmation; a failed save keeps your edits available for retry.'
            )}
          </p>
          <p className="help-card-detail">
            {tr(
              'In My Profile you can reset a profile to factory defaults (with Undo), discard draft changes, or export your profile. In Advanced Keys you can delete individual bindings or clear all in one click.'
            )}
          </p>
          {onOpenProfiles && (
            <div className="help-card-actions">
              <button type="button" className="secondary-button" onClick={onOpenProfiles}>
                {tr('Open My Profile')}
              </button>
            </div>
          )}
        </article>

        <article className="settings-card help-card">
          <div className="help-card-head">
            <Activity size={20} />
            <h2>{tr('Hall Stream & live testing')}</h2>
          </div>
          <p>
            {tr(
              'Hall Stream always scans every key on the keyboard in real time, even if you click a key on the preview before starting.'
            )}
          </p>
          <p className="help-card-detail">
            {tr(
              'Click any key on the keyboard preview or in the Live keys list to pin it as the focused readout, and click it again (or press Unpin) to return to automatic focus.'
            )}
          </p>
        </article>

        <article className="settings-card help-card">
          <div className="help-card-head">
            <Cpu size={20} />
            <h2>{tr('Background Service')}</h2>
          </div>
          <p>
            {tr(
              'Custom Effects, Rhythm Sync and Gamepad need the Windows background service. Open Settings > Background Service for setup. Gamepad also requires ViGEmBus.'
            )}
          </p>
          <div className="help-card-actions">
            {onOpenBackgroundService && (
              <button type="button" className="secondary-button" onClick={onOpenBackgroundService}>
                <SlidersHorizontal size={14} />
                {tr('Open Background Service')}
              </button>
            )}
            {onOpenDiagnostics && (
              <button type="button" className="ghost-button" onClick={onOpenDiagnostics}>
                {tr('Open Diagnostics')}
              </button>
            )}
          </div>
        </article>
      </div>

      <article className="settings-card help-footer-card">
        <div>
          <h2>{tr('Documentation & community links')}</h2>
          <p>
            {tr(
              'Bug reports and new keyboard requests in English or Vietnamese are welcome. Clicking the links below pre-selects the matching GitHub issue template.'
            )}
          </p>
        </div>
        <div className="help-footer-links">
          <a href={BRAND.docsUrl} target="_blank" rel="noreferrer">
            {tr('Read the documentation')}
          </a>
          <span>·</span>
          <a href={BRAND.bugReportUrl} target="_blank" rel="noreferrer">
            {tr('Report a bug')}
          </a>
          <span>·</span>
          <a href={BRAND.addBoardUrl} target="_blank" rel="noreferrer">
            {tr('Request keyboard support')}
          </a>
          <span>·</span>
          <a href={BRAND.submitBoardDocUrl} target="_blank" rel="noreferrer">
            {tr('Board submission guide')}
          </a>
          <span>·</span>
          <a href={BRAND.releasesUrl} target="_blank" rel="noreferrer">
            {tr('Windows Service releases')}
          </a>
        </div>
      </article>
    </div>
  );
}

export { HelpPage };
