import type { RefObject } from 'react';
import { CURVE_PRESETS, type CurvePoint, type GamepadConfiguration } from '../../keyboard/gamepad';
import type { GamepadStatus } from '../../protocol/gamepadService';

export function GamepadConfigTab({
  config,
  status,
  disabled,
  point,
  curveSvgRef,
  t,
  onSetPoint,
  onPatch,
  onStartCurveDrag,
  onMoveCurveDrag,
  onFinishCurve,
  onChangeCurve,
}: {
  config: GamepadConfiguration;
  status: GamepadStatus | null;
  disabled: boolean;
  point: number;
  curveSvgRef: RefObject<SVGSVGElement | null>;
  t: (text: string) => string;
  onSetPoint: (index: number) => void;
  onPatch: (next: Partial<GamepadConfiguration>) => void;
  onStartCurveDrag: (index: number, pointerId: number, target: SVGCircleElement) => void;
  onMoveCurveDrag: (clientX: number, clientY: number) => void;
  onFinishCurve: (cancel?: boolean) => void;
  onChangeCurve: (index: number, x: number, y: number) => void;
}) {
  return (
    <div
      role="tabpanel"
      id="gp-configuration"
      aria-labelledby="gp-tab-configuration"
      className="gp-columns"
    >
      <section className="gp-card">
        <h3>{t('Analog Curve')}</h3>
        <svg
          ref={curveSvgRef}
          className="gp-curve"
          viewBox="0 0 320 250"
          onPointerMove={(event) => onMoveCurveDrag(event.clientX, event.clientY)}
          onPointerUp={() => onFinishCurve()}
          onPointerCancel={() => onFinishCurve(true)}
          onLostPointerCapture={() => onFinishCurve(true)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((n) => (
            <g key={n}>
              <line x1={30 + 270 * n} x2={30 + 270 * n} y1="20" y2="220" />
              <line x1="30" x2="300" y1={220 - 200 * n} y2={220 - 200 * n} />
            </g>
          ))}
          <polygon
            points={
              '30,220 ' +
              config.curve.map(([x, y]) => `${30 + x * 270},${220 - y * 200}`).join(' ') +
              ' 300,220'
            }
          />
          <polyline
            points={config.curve.map(([x, y]) => `${30 + x * 270},${220 - y * 200}`).join(' ')}
          />
          {config.curve.map(([x, y], index) => (
            <circle
              key={index}
              role="slider"
              tabIndex={index > 0 && index < config.curve.length - 1 ? 0 : -1}
              aria-label={'Curve point ' + index}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(y * 100)}
              cx={30 + x * 270}
              cy={220 - y * 200}
              r="6"
              onPointerDown={(event) => {
                onSetPoint(index);
                if (
                  disabled ||
                  event.button !== 0 ||
                  !event.isPrimary ||
                  index === 0 ||
                  index === config.curve.length - 1
                ) {
                  return;
                }
                onStartCurveDrag(index, event.pointerId, event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                  event.preventDefault();
                  const deltaX =
                    event.key === 'ArrowRight' ? 0.01 : event.key === 'ArrowLeft' ? -0.01 : 0;
                  const deltaY =
                    event.key === 'ArrowUp' ? 0.01 : event.key === 'ArrowDown' ? -0.01 : 0;
                  onChangeCurve(index, x + deltaX, y + deltaY);
                }
              }}
            />
          ))}
          <text x="30" y="244">
            0%
          </text>
          <text x="270" y="244">
            100%
          </text>
        </svg>
        <p className="gp-field-title">{t('Choose a preset')}</p>
        <div className="gp-presets">
          {Object.keys(CURVE_PRESETS).map((name) => (
            <button
              key={name}
              className={
                JSON.stringify(config.curve) === JSON.stringify(CURVE_PRESETS[name]) ? 'active' : ''
              }
              disabled={disabled}
              onClick={() => {
                onPatch({
                  curve: CURVE_PRESETS[name].map((p) => [...p] as CurvePoint),
                });
                onSetPoint(1);
              }}
            >
              <svg viewBox="0 0 60 44" aria-hidden="true">
                <polyline
                  points={CURVE_PRESETS[name]
                    .map(([x, y]) => `${4 + 52 * x},${40 - 36 * y}`)
                    .join(' ')}
                />
              </svg>
              <span>{name}</span>
            </button>
          ))}
        </div>
        <div className="gp-tools">
          <button
            disabled={disabled || config.curve.length >= 16}
            onClick={() => {
              let index = 1;
              for (let i = 2; i < config.curve.length; i++) {
                if (
                  config.curve[i][0] - config.curve[i - 1][0] >
                  config.curve[index][0] - config.curve[index - 1][0]
                ) {
                  index = i;
                }
              }
              const prevPoint = config.curve[index - 1];
              const nextPoint = config.curve[index];
              const curve = [...config.curve];
              curve.splice(index, 0, [
                (prevPoint[0] + nextPoint[0]) / 2,
                (prevPoint[1] + nextPoint[1]) / 2,
              ]);
              onPatch({ curve });
              onSetPoint(index);
            }}
          >
            {t('Add curve point')}
          </button>
          <button
            disabled={disabled || point <= 0 || point >= config.curve.length - 1}
            onClick={() => {
              onPatch({
                curve: config.curve.filter((_, index) => index !== point),
              });
              onSetPoint(1);
            }}
          >
            {t('Remove curve point')}
          </button>
        </div>
      </section>
      <section className="gp-card">
        <h3>{t('Response')}</h3>
        <div className="gp-response-setting">
          <label className="gp-switch">
            {t('Windows hook fallback')}
            <input
              type="checkbox"
              role="switch"
              checked={config.keyboardSuppressionMode === 'hook'}
              disabled={disabled || !status?.capabilities.keyboardHook}
              onChange={(event) =>
                onPatch({
                  keyboardSuppressionMode: event.target.checked ? 'hook' : 'firmware',
                })
              }
            />
          </label>
          <p>
            {t(
              'Off by default. Firmware blocking is preferred; enable this only when you need the Windows hook fallback.'
            )}
          </p>
          {config.keyboardSuppressionMode === 'hook' && (
            <p className="gp-warning" role="note">
              {t(
                'Windows hooking can conflict with anti-cheat. Turn off Gamepad and this fallback before playing VALORANT or League of Legends (Vanguard), Fortnite (EAC), or other games using kernel anti-cheat. Other games may work if their rules allow it; user-mode anti-cheat is not a guarantee.'
              )}
            </p>
          )}
        </div>
        <p>
          {t(
            'Analog stick and trigger travel is independent of Actuation Point and Rapid Trigger. Digital buttons follow the keyboard settings.'
          )}
        </p>
        {(
          [
            ['angleEnabled', 'Angle adjustment'],
            ['square', 'Square joystick output'],
            ['snappy', 'Snappy Joystick'],
          ] as const
        ).map(([key, label]) => (
          <div className="gp-response-setting" key={key}>
            <label className="gp-switch">
              {t(label)}
              <input
                type="checkbox"
                role="switch"
                checked={config[key]}
                disabled={disabled}
                onChange={(event) => onPatch({ [key]: event.target.checked })}
              />
            </label>
            <p>
              {t(
                key === 'angleEnabled'
                  ? 'Adjust the forward diagonal angle from 30° to 60°.'
                  : key === 'square'
                    ? 'Circle limits diagonal travel; square allows both axes to reach full output.'
                    : 'Snappy uses the stronger direction. Equal opposing inputs cancel.'
              )}
            </p>
            {key === 'angleEnabled' && config.angleEnabled && (
              <label className="gp-angle">
                {config.angle}°
                <input
                  aria-label={t('Angle adjustment')}
                  type="range"
                  min="30"
                  max="60"
                  disabled={disabled}
                  value={config.angle}
                  onChange={(event) => onPatch({ angle: event.target.valueAsNumber })}
                />
              </label>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
