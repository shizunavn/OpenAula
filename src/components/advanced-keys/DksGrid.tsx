import React, { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { AppSelect } from '../../app/components/AppSelect';
import { HERO68_KEY_LABEL_BY_ID } from '../../app/helpers';
import type { AdvancedBinding } from '../../protocol/hero68/advanced';
import { remapLabel } from '../../protocol/hero68/remap';
import { encodeXsydDksStateRow } from '../../protocol/xsyd/advanced';
import { ActionPicker } from './ActionPicker';

const phases = ['Start of press', 'Deep press', 'Release from deep', 'End of release'];
const label = (key: string) => HERO68_KEY_LABEL_BY_ID[key] ?? key;

export const DKS_PALETTE_CATEGORIES: ReadonlyArray<{
  id: string;
  label: string;
  items: ReadonlyArray<{ label: string; value: number }>;
}> = [
  {
    id: 'letter',
    label: 'LETTER',
    items: Array.from({ length: 26 }, (_, i) => ({
      label: String.fromCharCode(65 + i),
      value: 4 + i
    }))
  },
  {
    id: 'number',
    label: 'NUMBER KEY',
    items: [
      { label: '1', value: 30 },
      { label: '2', value: 31 },
      { label: '3', value: 32 },
      { label: '4', value: 33 },
      { label: '5', value: 34 },
      { label: '6', value: 35 },
      { label: '7', value: 36 },
      { label: '8', value: 37 },
      { label: '9', value: 38 },
      { label: '0', value: 39 }
    ]
  },
  {
    id: 'symbolic',
    label: 'SYMBOLIC KEY',
    items: [
      { label: '- _', value: 45 },
      { label: '= +', value: 46 },
      { label: '[ {', value: 47 },
      { label: '] }', value: 48 },
      { label: '\\ |', value: 49 },
      { label: '; :', value: 51 },
      { label: '\' "', value: 52 },
      { label: '` ~', value: 53 },
      { label: ', <', value: 54 },
      { label: '. >', value: 55 },
      { label: '/ ?', value: 56 }
    ]
  },
  {
    id: 'basic',
    label: 'BASIC KEY',
    items: [
      { label: 'Esc', value: 41 },
      { label: 'Tab', value: 43 },
      { label: 'Caps', value: 57 },
      { label: 'L Shift', value: 0xe1 },
      { label: 'L Ctrl', value: 0xe0 },
      { label: 'L Win', value: 0xe3 },
      { label: 'L Alt', value: 0xe2 },
      { label: 'Space', value: 44 },
      { label: 'R Alt', value: 0xe6 },
      { label: 'Fn', value: 0x01 },
      { label: 'R Ctrl', value: 0xe4 },
      { label: 'R Shift', value: 0xe5 },
      { label: 'Enter', value: 40 },
      { label: 'Bksp', value: 42 }
    ]
  },
  {
    id: 'function',
    label: 'FUNCTION KEY',
    items: Array.from({ length: 12 }, (_, i) => ({
      label: `F${i + 1}`,
      value: 58 + i
    }))
  },
  {
    id: 'control',
    label: 'KEYBOARD CONTROL',
    items: [
      { label: 'Ins', value: 73 },
      { label: 'Del', value: 76 },
      { label: 'Home', value: 74 },
      { label: 'End', value: 77 },
      { label: 'PgUp', value: 75 },
      { label: 'PgDn', value: 78 },
      { label: '↑', value: 82 },
      { label: '↓', value: 81 },
      { label: '←', value: 80 },
      { label: '→', value: 79 },
      { label: 'None', value: 0 }
    ]
  }
];

export function Depth({
  value,
  onChange,
  title,
  disabled = false
}: {
  value: number;
  onChange: (n: number) => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <label className={`ak-depth ${disabled ? 'is-readonly' : ''}`}>
      <input
        aria-label={title}
        type="number"
        min="0.1"
        max="3.4"
        step="0.05"
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span>mm</span>
    </label>
  );
}

/**
 * Compute which of the 7 visual track nodes (`0..6`) and 6 connecting segments (`0..5`)
 * are lit for a given 4-phase DKS state row (`[s0, s1, s2, s3]`), matching the official
 * AULA WIN 68 HE MAX DKS visual editor (`image_5b2687.jpg`) and `0x26` bitmask.
 *
 * Node indices:
 * - `0`: Phase 0 (`↓ 1.4mm` Start of press)
 * - `1`: Hold-1 bridge (`↓ 1.4mm → 3.4mm`, square node)
 * - `2`: Phase 1 (`↓ 3.4mm` Deep press)
 * - `3`: Hold-2 bridge (`↓ 3.4mm → ↑ 3.4mm`, square node)
 * - `4`: Phase 2 (`↑ 3.4mm` Release from deep)
 * - `5`: Hold-3 bridge (`↑ 3.4mm → 1.4mm`, square node)
 * - `6`: Phase 3 (`↑ 1.4mm` End of release)
 */
export function dksVisualTrackState(
  row: readonly number[],
  isWin68 = false
): {
  nodes: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  segments: [boolean, boolean, boolean, boolean, boolean, boolean];
  maskHex: string;
} {
  const nodes: [boolean, boolean, boolean, boolean, boolean, boolean, boolean] = [
    false,
    false,
    false,
    false,
    false,
    false,
    false
  ];
  const segments: [boolean, boolean, boolean, boolean, boolean, boolean] = [
    false,
    false,
    false,
    false,
    false,
    false
  ];
  let mask = 0;
  try {
    mask = encodeXsydDksStateRow(row);
  } catch {
    mask = 0;
  }
  const [s0, s1, s2, s3] = row;
  if (s0 === 14 && s1 === 0 && s2 === 0 && s3 === 0) {
    // Hold 1 (0x03): Node 0 (circle) ─── Node 1 (square)
    nodes[0] = true;
    nodes[1] = true;
    segments[0] = true;
  } else if (s0 === 0 && s1 === 14 && s2 === 0 && s3 === 0) {
    // Hold 2 (0x1C): Node 2 (circle) ─── Node 3 (square)
    nodes[2] = true;
    nodes[3] = true;
    segments[2] = true;
  } else if (s0 === 0 && s1 === 0 && s2 === 14 && s3 === 0) {
    // Hold 3 (0x60): Node 4 (circle) ─── Node 5 (square)
    nodes[4] = true;
    nodes[5] = true;
    segments[4] = true;
  } else if (s0 === 6 && s1 === 12 && s2 === 0 && s3 === 0) {
    // Hold 0 -> 2 (0x1F): Nodes 0..3
    nodes[0] = nodes[1] = nodes[2] = nodes[3] = true;
    segments[0] = segments[1] = segments[2] = true;
  } else if (s0 === 0 && s1 === 6 && s2 === 12 && s3 === 0) {
    // Hold 1 -> 3 (0x7C): Nodes 2..5
    nodes[2] = nodes[3] = nodes[4] = nodes[5] = true;
    segments[2] = segments[3] = segments[4] = true;
  } else if (s0 === 6 && s1 === 4 && s2 === 12 && s3 === 0) {
    // Hold 0 -> 3 (0x7F): Nodes 0..5
    nodes[0] = nodes[1] = nodes[2] = nodes[3] = nodes[4] = nodes[5] = true;
    segments[0] = segments[1] = segments[2] = segments[3] = segments[4] = true;
  } else {
    if (s0 !== 0) nodes[0] = true;
    if (s1 !== 0) nodes[2] = true;
    if (s2 !== 0) nodes[4] = true;
    if (s3 !== 0) {
      nodes[6] = true;
      if (isWin68 && s3 === 10 && s0 === 0 && s1 === 0 && s2 === 0) {
        // In WIN 68 HE MAX (0xC0 = 0x40 | 0x80), Row D (End) lights Node 5 (square) ─── Node 6 (circle)
        nodes[5] = true;
        segments[5] = true;
      }
    }
  }
  return {
    nodes,
    segments,
    maskHex: `0x${mask.toString(16).padStart(2, '0').toUpperCase()}`
  };
}

export function DksGrid({
  binding,
  onChange,
  isWin68 = false
}: {
  binding: AdvancedBinding;
  onChange: (b: AdvancedBinding) => void;
  isWin68?: boolean;
}) {
  const { tr } = useI18n();
  const [activeSlot, setActiveSlot] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>('letter');
  const drag = useRef<{
    row: number;
    start: number;
    end: number;
  } | null>(null);
  const skipClick = useRef(false);
  const [preview, setPreview] = useState<{
    row: number;
    start: number;
    end: number;
  } | null>(null);
  const setRow = (r: number, states: number[]) =>
    onChange({
      ...binding,
      states: binding.states.map((s, i) => (i === r ? states : s))
    });
  const setActionAt = (r: number, value: number) =>
    onChange({
      ...binding,
      actions: binding.actions.map((a, i) => (i === r ? value : a)),
      states:
        value === 0 ? binding.states.map((s, i) => (i === r ? [0, 0, 0, 0] : s)) : binding.states
    });
  const hold = (start: number, end: number): number[] => {
    const states = [0, 0, 0, 0];
    if (end === start + 1) {
      states[start] = 14;
    } else if (start === 0 && end === 2) {
      states[0] = 6;
      states[1] = 12;
    } else if (start === 0 && end === 3) {
      states[0] = 6;
      states[1] = 4;
      states[2] = 12;
    } else if (start === 1 && end === 3) {
      states[1] = 6;
      states[2] = 12;
    }
    return states;
  };
  const updateDepth = (phaseIndex: number, nextMm: number) => {
    if (!Number.isFinite(nextMm)) return;
    if (isWin68) {
      // On WIN 68 HE MAX (opcode 0x26), shallow press (thresholds[0]) and shallow
      // release (thresholds[3]) share `actuationUm`, while deep points are fixed at 3.40 mm.
      if (phaseIndex === 0 || phaseIndex === 3) {
        const clamped = Math.max(0.1, Math.min(3.3, Math.round(nextMm * 100) / 100));
        onChange({
          ...binding,
          thresholds: [clamped, 3.4, 3.4, clamped]
        });
      }
      return;
    }
    onChange({
      ...binding,
      thresholds: binding.thresholds.map((n, j) => (phaseIndex === j ? nextMm : n))
    });
  };
  const presets = [
    'Custom',
    'No action',
    'Tap at start',
    'Tap at deep press',
    'Tap on release from deep',
    'Tap at end of release',
    'Hold: start → deep press',
    'Hold: deep press → release from deep',
    'Hold: release from deep → end',
    'Hold: start → release from deep',
    'Hold: start → end',
    'Hold: deep press → end'
  ];
  const patterns = [
    [0, 0, 0, 0],
    [10, 0, 0, 0],
    [0, 10, 0, 0],
    [0, 0, 10, 0],
    [0, 0, 0, 10],
    hold(0, 1),
    hold(1, 2),
    hold(2, 3),
    hold(0, 2),
    hold(0, 3),
    hold(1, 3)
  ];
  const currentPalette =
    DKS_PALETTE_CATEGORIES.find(c => c.id === activeCategory) ?? DKS_PALETTE_CATEGORIES[0];

  return (
    <div className={`ak-dks-editor ${isWin68 ? 'is-win68-dks' : ''}`}>
      <div className="ak-dks-toolbar">
        <p>
          {tr(
            'Click a key slot on the left, drag or click the travel points on the timeline, or pick keys from the category tabs below.'
          )}
        </p>
        {isWin68 && (
          <button
            type="button"
            className="secondary-button ak-dks-stairstep-btn"
            onClick={() =>
              onChange({
                ...binding,
                thresholds: [binding.thresholds[0] || 1.4, 3.4, 3.4, binding.thresholds[0] || 1.4],
                states: [hold(0, 1), hold(1, 2), hold(2, 3), [0, 0, 0, 10]]
              })
            }
          >
            {tr('4-Stage Hold + End (0x03 · 0x1C · 0x60 · 0xC0)')}
          </button>
        )}
      </div>

      <div
        className="ak-dks-visual-card"
        onPointerUp={() => {
          const d = drag.current;
          if (d && d.end > d.start) {
            setRow(d.row, hold(d.start, d.end));
            skipClick.current = true;
          }
          drag.current = null;
          setPreview(null);
        }}
        onPointerLeave={() => {
          drag.current = null;
          setPreview(null);
        }}
      >
        <div className="ak-dks-phase-header">
          <span className="ak-grid-corner">{tr('Key / Slot')}</span>
          <div className="ak-dks-phase-columns">
            {phases.map((p, i) => {
              const isFixedDeepOnWin68 = isWin68 && (i === 1 || i === 2);
              return (
                <div className={`ak-phase ak-phase-${i}`} key={p}>
                  {i < 2 ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
                  <strong>{tr(p)}</strong>
                  {isFixedDeepOnWin68 ? (
                    <span
                      className="ak-dks-fixed-depth"
                      title={tr('Fixed bottom-out travel on WIN 68 HE MAX')}
                    >
                      {binding.thresholds[i].toFixed(1)}mm
                    </span>
                  ) : (
                    <Depth
                      value={binding.thresholds[i]}
                      title={tr('{point} depth', { point: tr(p) })}
                      onChange={v => updateDepth(i, v)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <span className="ak-dks-pattern-col-head">{tr('Mode / Mask')}</span>
        </div>

        <div className="ak-dks-rows">
          {binding.actions.map((action, r) => {
            const matched = patterns.findIndex(p => p.every((n, i) => n === binding.states[r][i]));
            const { nodes, segments, maskHex } = dksVisualTrackState(binding.states[r], isWin68);
            return (
              <div
                className={`ak-dks-visual-row ${activeSlot === r ? 'is-selected-slot' : ''}`}
                key={r}
                onClick={() => setActiveSlot(r)}
              >
                <div className="ak-dks-slot-cell">
                  <span className="ak-dks-slot-index">{r + 1}</span>
                  <ActionPicker
                    value={action}
                    title={tr('Action {count}', { count: r + 1 })}
                    onSelectSlot={() => setActiveSlot(r)}
                    onChange={v => setActionAt(r, v)}
                  />
                </div>

                <div
                  className="ak-dks-track-7"
                  role="group"
                  aria-label={tr('Action {count} travel timeline', { count: r + 1 })}
                >
                  {[0, 1, 2, 3, 4, 5, 6].map(nodeIdx => {
                    const isMainPhase = nodeIdx % 2 === 0;
                    const phaseIdx = nodeIdx >> 1;
                    const bridgeIdx = (nodeIdx - 1) >> 1;
                    const lit = nodes[nodeIdx];
                    const segPrev = nodeIdx > 0 ? segments[nodeIdx - 1] : false;
                    const segNext = nodeIdx < 6 ? segments[nodeIdx] : false;
                    const highlighted =
                      preview?.row === r &&
                      isMainPhase &&
                      phaseIdx >= preview.start &&
                      phaseIdx <= preview.end;

                    if (isMainPhase) {
                      const pName = phases[phaseIdx]!;
                      return (
                        <button
                          type="button"
                          key={nodeIdx}
                          className={`ak-dks-node is-phase-circle ${lit ? 'is-active' : ''} ${highlighted ? 'is-dragging' : ''} ${segPrev ? 'has-seg-prev' : ''} ${segNext ? 'has-seg-next' : ''}`}
                          aria-label={tr('Action {count}: {point}', {
                            count: r + 1,
                            point: tr(pName)
                          })}
                          aria-pressed={lit}
                          onPointerDown={e => {
                            skipClick.current = false;
                            if (e.button === 0) {
                              drag.current = { row: r, start: phaseIdx, end: phaseIdx };
                              setPreview(drag.current);
                            }
                          }}
                          onPointerEnter={() => {
                            if (drag.current?.row === r && phaseIdx >= drag.current.start) {
                              drag.current.end = phaseIdx;
                              setPreview({ ...drag.current });
                            }
                          }}
                          onClick={e => {
                            e.stopPropagation();
                            setActiveSlot(r);
                            if (skipClick.current) {
                              skipClick.current = false;
                              return;
                            }
                            const states = binding.states[r].some(v => v !== 0 && v !== 10)
                              ? [0, 0, 0, 0]
                              : [...binding.states[r]];
                            states[phaseIdx] = states[phaseIdx] === 10 ? 0 : 10;
                            setRow(r, states);
                          }}
                        >
                          <span className="ak-node-shape" />
                        </button>
                      );
                    }

                    const targetHold = hold(bridgeIdx, bridgeIdx + 1);
                    const isThisHold = targetHold.every((v, i) => binding.states[r][i] === v);
                    return (
                      <button
                        type="button"
                        key={nodeIdx}
                        className={`ak-dks-node is-bridge-square ${lit ? 'is-active' : ''} ${segPrev ? 'has-seg-prev' : ''} ${segNext ? 'has-seg-next' : ''}`}
                        aria-label={tr('Action {count}: Hold segment {seg}', {
                          count: r + 1,
                          seg: bridgeIdx + 1
                        })}
                        aria-pressed={lit}
                        onClick={e => {
                          e.stopPropagation();
                          setActiveSlot(r);
                          setRow(r, isThisHold ? [0, 0, 0, 0] : targetHold);
                        }}
                      >
                        <span className="ak-node-shape" />
                      </button>
                    );
                  })}
                </div>

                <div className="ak-dks-pattern-cell">
                  {isWin68 && (
                    <code className="ak-dks-mask-badge" title={tr('XSYD 0x26 phase bitmask')}>
                      {maskHex}
                    </code>
                  )}
                  <AppSelect
                    label={tr('Action {count} pattern', { count: r + 1 })}
                    value={matched + 1}
                    onChange={value => {
                      const pattern = patterns[value - 1];
                      if (pattern) {
                        setRow(r, pattern);
                      }
                    }}
                    options={presets.map((pattern, i) => ({
                      value: i,
                      label: tr(pattern),
                      disabled: i === 0
                    }))}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <p className="ak-hint ak-dks-track-hint">
          {tr('Press')}: {binding.thresholds[0].toFixed(2)} → {binding.thresholds[1].toFixed(2)} mm
          · {tr('Release')}: {binding.thresholds[2].toFixed(2)} → {binding.thresholds[3].toFixed(2)}{' '}
          mm ·{' '}
          {tr(
            'Click a circle (●) for a single tap, or click a square bridge (■) / drag between circles to hold.'
          )}
        </p>
      </div>

      <div className="ak-dks-palette" aria-label={tr('DKS key category picker')}>
        <div className="ak-dks-palette-head">
          <div className="ak-dks-palette-tabs" role="tablist">
            {DKS_PALETTE_CATEGORIES.map(cat => (
              <button
                type="button"
                role="tab"
                key={cat.id}
                aria-selected={activeCategory === cat.id}
                className={`ak-dks-palette-tab ${activeCategory === cat.id ? 'is-active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                {tr(cat.label)}
              </button>
            ))}
          </div>
          <span className="ak-dks-active-slot-pill">
            {tr('Assigning to Slot {slot}', { slot: activeSlot + 1 })}:{' '}
            <strong>{remapLabel(binding.actions[activeSlot])}</strong>
          </span>
        </div>
        <div className="ak-dks-palette-keys">
          {currentPalette.items.map(item => {
            const isCurrent = binding.actions[activeSlot] === item.value;
            return (
              <button
                type="button"
                key={`${currentPalette.id}:${item.label}:${item.value}`}
                className={`ak-dks-keycap ${isCurrent ? 'is-active' : ''}`}
                onClick={() => {
                  setActionAt(activeSlot, item.value);
                  setActiveSlot((activeSlot + 1) % 4);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
