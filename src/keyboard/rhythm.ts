import { getBoard, type HeroDeviceModelId } from './registry';
export const RHYTHM_MODES = [
  {
    id: 169,
    name: 'Dazzling Rock',
    description: 'Rings burst outward with every beat.',
    shape: 'rings'
  },
  {
    id: 170,
    name: 'Clouds',
    description: 'Moving light and shadows across the rows.',
    shape: 'clouds'
  },
  {
    id: 171,
    name: 'Light Field',
    description: 'The whole keyboard changes with the music.',
    shape: 'field'
  },
  {
    id: 172,
    name: 'Gurgling Stream',
    description: 'A wave of sound travels across the keys.',
    shape: 'stream'
  },
  {
    id: 173,
    name: 'Blooming Passion',
    description: 'Flowers of light bloom from changing centers.',
    shape: 'bloom'
  },
  {
    id: 428,
    name: 'Dynamic Spectrum',
    description: 'Frequency detail, from bass to treble.',
    shape: 'spectrum'
  },
  {
    id: 429,
    name: 'Spectrum Bars',
    description: 'Frequency equalizer stretched across 16 log-spaced bands.',
    shape: 'spectrum'
  },
  {
    id: 432,
    name: 'Audio Marquee',
    description: 'A wrapping band fills up the rows with the music level.',
    shape: 'stream'
  },
  {
    id: 434,
    name: 'Radial Chase',
    description: 'A light front rolls outward from the centre.',
    shape: 'rings'
  },
  {
    id: 180,
    name: 'Off',
    description: 'Clear the key LEDs while side rhythm continues.',
    shape: 'off'
  }
] as const;
export const RHYTHM_SIDE_MODES = [
  {
    id: 500,
    name: 'Leave onboard'
  },
  {
    id: 501,
    name: 'One-end meter'
  },
  {
    id: 502,
    name: 'Center-out meter'
  },
  {
    id: 503,
    name: 'Light field'
  },
  {
    id: 504,
    name: 'Loop 18 slots'
  },
  {
    id: 505,
    name: 'Peak-hold meter'
  },
  {
    id: 506,
    name: 'Far-end meter'
  }
] as const;
export type RhythmMode = (typeof RHYTHM_MODES)[number]['id'];
export type RhythmSideMode = (typeof RHYTHM_SIDE_MODES)[number]['id'];
export type RhythmConfiguration = {
  version: 1;
  keyMode: RhythmMode;
  sideMode: RhythmSideMode;
  endpoint: string;
  brightness: number;
  sensitivity: number;
  releaseMs: number;
  color: string;
  palette: 'fixed' | 'rainbow' | 'aurora' | 'fire';
  spectrum: {
    db: number;
    window: 'hann' | 'hamming' | 'blackman';
    spatialRadius: number;
  };
};
export function defaultRhythm(): RhythmConfiguration {
  return {
    version: 1,
    keyMode: 428,
    sideMode: 500,
    endpoint: 'default',
    brightness: 80,
    sensitivity: 4,
    releaseMs: 80,
    color: '#f611a5',
    palette: 'rainbow',
    spectrum: {
      db: 35,
      window: 'hann',
      spatialRadius: 8
    }
  };
}
export function validateRhythm(input: unknown): RhythmConfiguration {
  if (!input || typeof input !== 'object') {
    throw Error('Expected rhythm configuration');
  }
  const v = input as RhythmConfiguration;
  const range = (n: number, low: number, high: number) =>
    Number.isFinite(n) && n >= low && n <= high;
  if (
    v.version !== 1 ||
    !RHYTHM_MODES.some(m => m.id === v.keyMode) ||
    !RHYTHM_SIDE_MODES.some(m => m.id === v.sideMode) ||
    typeof v.endpoint !== 'string' ||
    !v.endpoint.length ||
    v.endpoint.length > 512 ||
    /[\r\n\0]/.test(v.endpoint) ||
    !range(v.brightness, 0, 100) ||
    !range(v.sensitivity, 0.1, 10) ||
    !range(v.releaseMs, 0, 200) ||
    !/^#[0-9a-f]{6}$/i.test(v.color) ||
    !['fixed', 'rainbow', 'aurora', 'fire'].includes(v.palette) ||
    !v.spectrum ||
    !range(v.spectrum.db, 0, 100) ||
    !['hann', 'hamming', 'blackman'].includes(v.spectrum.window) ||
    !Number.isInteger(v.spectrum.spatialRadius) ||
    !range(v.spectrum.spatialRadius, 0, 16)
  ) {
    throw Error('Invalid rhythm configuration');
  }
  return {
    version: 1,
    keyMode: v.keyMode,
    sideMode: v.sideMode,
    endpoint: v.endpoint,
    brightness: v.brightness,
    sensitivity: v.sensitivity,
    releaseMs: v.releaseMs,
    color: v.color.toLowerCase(),
    palette: v.palette,
    spectrum: {
      ...v.spectrum
    }
  };
}

/** Restore saved drafts without reactivating the removed Beat Pulse mode or removed web-synth endpoint. */
export function restoreRhythm(input: unknown): RhythmConfiguration {
  if (input && typeof input === 'object') {
    const raw = input as {
      keyMode?: unknown;
      endpoint?: unknown;
    };
    const patched: Record<string, unknown> = {
      ...(input as Record<string, unknown>)
    };
    if (raw.keyMode === 430) {
      patched.keyMode = 428;
    }
    if (raw.endpoint === 'web-synth') {
      patched.endpoint = 'default';
    }
    return validateRhythm(patched);
  }
  return validateRhythm(input);
}

/** Convert HSL (`h: 0..360`, `sPct: 0..100`, `lPct: 0..100`) to `#rrggbb` hex. */
export function hslToHex(h: number, sPct: number, lPct: number): string {
  const hue = ((h % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, sPct / 100));
  const l = Math.max(0, Math.min(1, lPct / 100));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hue < 60) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (hue < 120) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (hue < 180) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (hue < 240) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (hue < 300) {
    r1 = x;
    g1 = 0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0;
    b1 = x;
  }
  const toByteHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round((v + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toByteHex(r1)}${toByteHex(g1)}${toByteHex(b1)}`;
}

/**
 * Log-spaced 16-band envelope from `AnalyserNode.getByteFrequencyData()`, mirroring
 * `logBands()` in `service/native/rhythm_core.h`. Voice and most music live under
 * ~2 kHz, so a linear bin-to-column map leaves everything in the first columns;
 * the log edges spread bass, mids and treble across the row, normalized to full scale [0, 1].
 */
export function logSpectrumBands(frequencyData: ArrayLike<number>) {
  const bins = frequencyData.length;
  const usable = Math.max(16, Math.min(bins, Math.floor(bins * 0.65)));
  const edge = (band: number) => Math.min(usable - 1, Math.round(Math.pow(usable - 1, band / 16)));
  const fullScale = 0.9 + 0.5 * Math.log10(1.1);
  const bands: number[] = [];
  for (let band = 0; band < 16; band++) {
    const start = edge(band);
    const stop = Math.max(start + 1, edge(band + 1));
    let energy = 0;
    for (let b = start; b < stop; b++) {
      const raw = frequencyData[b] ?? 0;
      energy += raw > 4 ? Math.pow((raw - 4) / 251, 2) : 0;
    }
    const rms = Math.sqrt(energy / Math.max(1, stop - start));
    const m = Math.min(1, rms * 1.35);
    bands.push(
      m > 0 ? Math.max(0, Math.min(1, (0.9 * m + 0.5 * Math.log10(1 + m * 0.1)) / fullScale)) : 0
    );
  }
  return bands;
}

/**
 * Render a 68/84-key Rhythm Sync frame from live Web Audio FFT/waveform data
 * (or the illustrative demo generator when `allowSynthFallback` is true).
 * In live mode (`allowSynthFallback === false`), missing or silent audio stays
 * 100% dark (`#000000`) with `level === 0` so the preview never animates without music.
 * `meter` is the peak-hold value used only by the side modes 505 (slot count) and 506.
 */
export function renderRhythmAudioFrame(
  config: RhythmConfiguration,
  timeMs: number,
  frequencyData?: Uint8Array | null,
  timeDomainData?: Uint8Array | null,
  model: HeroDeviceModelId = 'win68HeMax',
  allowSynthFallback = false
) {
  const board = getBoard(model);
  const t = timeMs / 1000;
  const phase = (t * 2) % 1;

  let level = 0;
  const colBins: number[] = Array(16).fill(0);
  const bands: number[] = Array(16).fill(0);
  let meter = 0;

  if (frequencyData && frequencyData.length > 0) {
    const usableBins = Math.max(
      16,
      Math.min(frequencyData.length, Math.floor(frequencyData.length * 0.65))
    );
    const dbGain = 0.5 + (config.spectrum.db / 100) * 1.8;
    const sensGain = Math.max(0.2, config.sensitivity * 0.35);
    let energySum = 0;
    for (let c = 0; c < 16; c++) {
      const startBin = Math.floor(Math.pow(c / 16, 1.5) * (usableBins - 1));
      const endBin = Math.max(startBin + 1, Math.floor(Math.pow((c + 1) / 16, 1.5) * usableBins));
      let acc = 0;
      for (let b = startBin; b < endBin; b++) {
        const raw = frequencyData[b] ?? 0;
        acc += raw > 4 ? (raw - 4) / 251 : 0;
      }
      const avg = acc / Math.max(1, endBin - startBin);
      const boosted = avg > 0 ? Math.min(1, Math.pow(avg, 1.25) * dbGain * sensGain) : 0;
      colBins[c] = boosted;
      energySum += boosted;
    }
    const bandsRaw = logSpectrumBands(frequencyData);
    for (let c = 0; c < 16; c++) {
      bands[c] = bandsRaw[c] > 0 ? Math.min(1, bandsRaw[c] * dbGain * sensGain) : 0;
    }
    level = Math.min(1, (energySum / 16) * 1.25);
    if (timeDomainData && timeDomainData.length > 0) {
      let rmsAcc = 0;
      for (let i = 0; i < timeDomainData.length; i++) {
        const centered = ((timeDomainData[i] ?? 128) - 128) / 128;
        rmsAcc += centered * centered;
      }
      const rms = Math.sqrt(rmsAcc / timeDomainData.length);
      const gatedRms = rms > 0.005 ? rms : 0;
      level = Math.min(1, Math.max(level, gatedRms * sensGain * 2.2));
    }
    for (let c = 0; c < 16; c++) {
      meter = Math.max(meter, bands[c]);
    }
    meter = Math.max(level, meter);
  } else if (allowSynthFallback) {
    level = Math.exp(-phase * 5) * (0.82 + 0.18 * Math.sin(t * 0.7));
    meter = Math.max(meter, level);
    for (let c = 0; c < 16; c++) {
      const nx = c / 15;
      colBins[c] = Math.max(
        0,
        Math.min(1, (Math.sin(nx * 9 + t * 3) * 0.5 + 0.5) * 0.45 + level * 0.65)
      );
      bands[c] = colBins[c];
    }
  }

  // Apply spatial smoothing across columns for Dynamic Spectrum (mode 428)
  const radius = Math.max(0, Math.min(8, Math.round(config.spectrum.spatialRadius / 2)));
  const smoothedBins = colBins.map((val, c) => {
    if (radius === 0) return val;
    let sum = 0;
    let weightSum = 0;
    for (let d = -radius; d <= radius; d++) {
      const idx = Math.max(0, Math.min(15, c + d));
      const w = radius + 1 - Math.abs(d);
      sum += colBins[idx] * w;
      weightSum += w;
    }
    return sum / Math.max(1, weightSum);
  });

  const maxBin = Math.max(
    smoothedBins.reduce((m, v) => Math.max(m, v), 0),
    bands.reduce((m, v) => Math.max(m, v), 0)
  );
  const isSpectrumMode = config.keyMode === 428 || config.keyMode === 429;
  const isSilentLive = !allowSynthFallback && level < 0.008 && (!isSpectrumMode || maxBin < 0.012);
  if (isSilentLive) {
    level = 0;
    meter = 0;
  }

  const keys: Record<string, string> = {};
  const rowCount = Math.max(1, board.rows.length);
  const maxRowIndex = Math.max(1, rowCount - 1);
  board.rows.forEach((row, y) =>
    row.forEach((key, x) => {
      if (key.spacer) {
        return;
      }
      if (config.keyMode === 180 || isSilentLive) {
        keys[key.id] = '#000000';
        return;
      }
      const nx = x / Math.max(1, row.length - 1);
      const ny = y / maxRowIndex;
      // Divide [0, 1] evenly across all rows (including y=0, the top number row, at rowFloor = 0.8 on 5-row boards)
      const rowFloor = (rowCount - 1 - y) / rowCount;
      const colIdx = Math.max(0, Math.min(15, Math.round(nx * 15)));
      const colEnergy = smoothedBins[colIdx] ?? level;
      let value = 0;
      let colorCoord = nx;
      switch (config.keyMode) {
        case 169:
          value = Math.hypot((nx - 0.5) * 1.6, ny - 0.5) < level ? 1 : 0;
          break;
        case 170:
          value = Math.max(0, Math.sin(nx * 5 + t * 2 + ny) * level);
          break;
        case 171:
          value = level;
          break;
        case 172: {
          const streamAmp = allowSynthFallback
            ? Math.max(0.25, level)
            : level >= 0.008
              ? Math.max(0.25, level)
              : 0;
          value =
            streamAmp > 0 && ny > 1 - Math.exp(-((phase + nx * 0.7) % 1) * 7) * streamAmp ? 1 : 0;
          break;
        }
        case 173:
          value =
            Math.hypot(nx - (0.5 + 0.3 * Math.sin(Math.floor(t * 3) * 2)), ny - 0.5) < level * 0.7
              ? 1
              : 0;
          break;
        case 428:
          value = allowSynthFallback
            ? colEnergy >= rowFloor
              ? 1
              : 0.02
            : colEnergy >= 0.012 && colEnergy >= rowFloor
              ? 1
              : 0;
          break;
        case 429: {
          const band = Math.max(0, Math.min(15, Math.floor(nx * 16)));
          const energy = bands[band] ?? 0;
          if (energy >= 0.012 && energy >= rowFloor) {
            const edge = Math.max(0, Math.min(1, (energy - rowFloor) * rowCount));
            value = 0.35 + 0.65 * edge;
          } else {
            value = allowSynthFallback ? 0.02 : 0;
          }
          break;
        }
        case 432: {
          // Audio Marquee: alternating-direction horizontal bars per row synced to music level & frequency band.
          const pos = y % 2 === 1 ? 1 - nx : nx;
          const rowBand = Math.max(
            0,
            Math.min(15, Math.floor(((rowCount - 1 - y) / rowCount) * 12 + pos * 3.99))
          );
          const bandEnergy = bands[rowBand] ?? colEnergy;
          const rowEnergy = Math.max(
            0,
            Math.min(
              1,
              bandEnergy > 0.01
                ? level * 0.45 + bandEnergy * 0.75
                : level * (1 - 0.1 * Math.abs(y - maxRowIndex / 2))
            )
          );
          if (level > 0 && rowEnergy > 0.012 && pos <= rowEnergy) {
            const headDist = rowEnergy - pos;
            value = headDist < 0.14 ? 1 : Math.max(0.25, Math.min(0.95, 1 - headDist * 0.65));
          } else {
            value = 0;
          }
          colorCoord = (pos + y * 0.12) % 1;
          break;
        }
        case 434: {
          // Radial Chase: beat-driven concentric shockwave rings chasing outward from the centre.
          if (level > 0) {
            const dx = (nx - 0.5) * 2;
            const dy = (ny - 0.5) * 1.35;
            const distNorm = Math.max(0, Math.min(1, Math.hypot(dx, dy) / 1.15));
            const band = Math.max(0, Math.min(15, Math.floor(nx * 16)));
            const bandEnergy = bands[band] ?? colEnergy;
            const drive = Math.max(
              0,
              Math.min(1, bandEnergy > 0.01 ? level * 0.55 + bandEnergy * 0.65 : level)
            );
            const ringWidth = 0.28;
            const ringDist = Math.abs(distNorm - drive);
            let ringVal = ringDist < ringWidth ? 1 - ringDist / ringWidth : 0;
            if (drive > 0.5 && distNorm < drive - 0.25) {
              const echoFront = ((drive * 1.75) % 1) * 0.65;
              const echoDist = Math.abs(distNorm - echoFront);
              if (echoDist < 0.22) {
                ringVal = Math.max(ringVal, (1 - echoDist / 0.22) * 0.85);
              }
            }
            value = distNorm <= drive + ringWidth * 0.5 ? Math.max(0, Math.min(1, ringVal)) : 0;
            colorCoord = (distNorm + level * 0.25) % 1;
          } else {
            value = 0;
          }
          break;
        }
      }
      const hue =
        config.palette === 'fire'
          ? colorCoord * 45
          : config.palette === 'aurora'
            ? 160 + colorCoord * 120
            : (colorCoord * 300 + t * 25) % 360;
      const fullBrightness =
        config.keyMode === 429 || config.keyMode === 432 || config.keyMode === 434;
      keys[key.id] =
        config.palette === 'fixed'
          ? '#' +
            [1, 3, 5]
              .map(i =>
                Math.round(
                  (parseInt(config.color.slice(i, i + 2), 16) * value * config.brightness) /
                    (fullBrightness ? 100 : 100 * 2)
                )
                  .toString(16)
                  .padStart(2, '0')
              )
              .join('')
          : hslToHex(hue, 90, value * config.brightness * (fullBrightness ? 0.01 : 0.005));
    })
  );
  const sideCount = board.capabilities.sideLedCount;
  const side = Array.from({ length: sideCount }, (_, i) => {
    if (isSilentLive) {
      return '#181c20';
    }
    const lit =
      config.sideMode === 501
        ? i < level * sideCount
        : config.sideMode === 505
          ? i < meter * sideCount
          : config.sideMode === 502
            ? Math.abs(i - Math.floor((sideCount - 1) / 2)) < level * (sideCount / 2)
            : config.sideMode === 506
              ? i >= sideCount - level * sideCount
              : config.sideMode === 503 || config.sideMode === 504;
    return lit ? hslToHex((t * 60 + i * 15) % 360, 85, level * config.brightness * 0.5) : '#181c20';
  });
  return {
    keys,
    side,
    level,
    meter
  };
}

/** Illustrative demo & synth fallback. Emits `#rrggbb` hex colors for every key. */
export function rhythmDemo(
  config: RhythmConfiguration,
  timeMs: number,
  model: HeroDeviceModelId = 'hero68'
) {
  return renderRhythmAudioFrame(config, timeMs, null, null, model, true);
}
