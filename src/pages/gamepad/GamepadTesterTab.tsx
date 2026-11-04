import type { Dispatch, SetStateAction } from 'react';
import GamepadLiveControls from '../../components/GamepadLiveControls';
import type { GamepadConfiguration } from '../../keyboard/gamepad';
import type { GamepadLiveStore } from '../../protocol/gamepadLive';
import type { GamepadStatus } from '../../protocol/gamepadService';
import { actionLabel, physicalLabel } from './gamepadDraftStorage';

export function GamepadTesterTab({
  config,
  status,
  demo,
  demoSamples,
  liveStore,
  t,
  onSetDemo,
  onSetDemoSamples,
}: {
  config: GamepadConfiguration;
  status: GamepadStatus | null;
  demo: boolean;
  demoSamples: Record<string, { distanceMm: number; pressed: boolean }>;
  liveStore: GamepadLiveStore;
  t: (text: string) => string;
  onSetDemo: (next: boolean) => void;
  onSetDemoSamples: Dispatch<
    SetStateAction<Record<string, { distanceMm: number; pressed: boolean }>>
  >;
}) {
  return (
    <div role="tabpanel" id="gp-tester" aria-labelledby="gp-tab-tester" className="gp-card">
      <h3>{t('Test Gamepad')}</h3>
      {!status?.enabled && !demo && <p>{t('Start Gamepad to view live controller input.')}</p>}
      <div className="gp-tools">
        <label className="gp-switch">
          {t('Try demo')}
          <input
            type="checkbox"
            role="switch"
            checked={demo}
            onChange={(event) => {
              onSetDemo(event.target.checked);
              onSetDemoSamples({});
            }}
          />
        </label>
        <button disabled={!demo} onClick={() => onSetDemoSamples({})}>
          {t('Release all')}
        </button>
        <span>
          {demo ? t('Demo') : t(status?.xinputVerified ? 'XInput verified' : 'XInput pending')}
        </span>
      </div>
      <GamepadLiveControls store={liveStore} />
      {demo && (
        <div className="gp-demo-sliders">
          {config.bindings.map((binding) => (
            <label key={binding.keyId}>
              {physicalLabel(binding.keyId)} → {actionLabel(binding.action)}
              <input
                type="range"
                min="0"
                max="3.4"
                step=".01"
                value={demoSamples[binding.keyId]?.distanceMm ?? 0}
                onChange={(event) => {
                  const distanceMm = event.target.valueAsNumber;
                  onSetDemoSamples((prev) => ({
                    ...prev,
                    [binding.keyId]: {
                      distanceMm,
                      pressed: distanceMm >= 1.6,
                    },
                  }));
                }}
              />
            </label>
          ))}
        </div>
      )}
      <p>
        {t('Output')}: {(status?.outputHz ?? 0).toFixed(1)} Hz · p99{' '}
        {(status?.outputP99Ms ?? 0).toFixed(2)} ms · {t('Stale samples')}:{' '}
        {status?.stale ? '✓' : '—'} · Timeouts: {status?.hall.timeouts ?? 0}
      </p>
      <details className="gp-diagnostics">
        <summary>{t('Diagnostics')}</summary>
        <h3>{t('Hall consumers')}</h3>
        <div className="gp-consumers">
          {status?.hall.consumers.map((consumer) => (
            <span key={consumer.id}>
              {consumer.id.startsWith('web:') ? 'Hall Stream' : consumer.id}:{' '}
              {consumer.keys.length} keys · {consumer.hz} Hz
            </span>
          ))}
        </div>
        <div className="gp-samples">
          {(status?.hall.keys ?? []).map((keyStat) => (
            <div key={keyStat.pos}>
              <b>{physicalLabel(keyStat.keyId)}</b>
              <span>
                {keyStat.hz.toFixed(1)}/{keyStat.requestedHz} Hz
              </span>
              <small>p99 {keyStat.intervalP99Ms.toFixed(2)} ms</small>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
