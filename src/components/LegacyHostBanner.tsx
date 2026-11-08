import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { BRAND, currentPageOnCanonicalHost, isLegacyHost } from '../brand';
import { useI18n } from '../i18n';
import './LegacyHostBanner.css';

/** How long the visitor can read the notice before being moved on. */
const REDIRECT_DELAY_MS = 8000;

/**
 * The web app used to live on open-hero68.pages.dev. That host keeps working so
 * saved bookmarks do not break, but it is no longer the canonical copy: show a
 * notice with a manual link, then move the visitor on its own.
 *
 * The deadline is wall-clock, not a tick count: a background tab has its timers
 * throttled to about once a minute, and a hidden tab must still move on when the
 * visitor returns instead of freezing at whatever number it reached.
 */
export default function LegacyHostBanner() {
  const { tr } = useI18n();
  const [seconds, setSeconds] = useState(REDIRECT_DELAY_MS / 1000);
  const legacy = isLegacyHost();
  const target = currentPageOnCanonicalHost();
  useEffect(() => {
    if (!legacy) {
      return;
    }
    const deadline = Date.now() + REDIRECT_DELAY_MS;
    const go = () => {
      window.clearInterval(timer);
      window.location.replace(target);
    };
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0) {
        go();
      }
    };
    const timer = window.setInterval(tick, 250);
    // Timers are throttled while hidden, so the tab may wake up past the
    // deadline; catch up as soon as the visitor can actually see the page.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [legacy, target]);
  if (!legacy) {
    return null;
  }
  return (
    <div className="legacy-host-banner" role="status">
      <span className="legacy-host-text">
        {tr(
          `${BRAND.displayName} has moved to a new address. This page now lives on the new site.`
        )}
      </span>
      <a className="legacy-host-link" href={target}>
        {tr('Open the new site')}
        <ArrowRight size={15} />
      </a>
      <span className="legacy-host-countdown">
        {tr(`Moving automatically in {seconds}s`).replace('{seconds}', String(seconds))}
      </span>
    </div>
  );
}
