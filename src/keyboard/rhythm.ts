import { getBoard, type HeroDeviceModelId } from './registry';
export const RHYTHM_MODES = ([{
  id: 169,
  name: 'Dazzling Rock',
  description: 'Rings burst outward with every beat.',
  shape: 'rings'
}, {
  id: 170,
  name: 'Clouds',
  description: 'Moving light and shadows across the rows.',
  shape: 'clouds'
}, {
  id: 171,
  name: 'Light Field',
  description: 'The whole keyboard changes with the music.',
  shape: 'field'
}, {
  id: 172,
  name: 'Gurgling Stream',
  description: 'A wave of sound travels across the keys.',
  shape: 'stream'
}, {
  id: 173,
  name: 'Blooming Passion',
  description: 'Flowers of light bloom from changing centers.',
  shape: 'bloom'
}, {
  id: 428,
  name: 'Dynamic Spectrum',
  description: 'Frequency detail, from bass to treble.',
  shape: 'spectrum'
}, {
  id: 180,
  name: 'Off',
  description: 'Clear the key LEDs while side rhythm continues.',
  shape: 'off'
}] as const);
export const RHYTHM_SIDE_MODES = ([{
  id: 500,
  name: 'Leave onboard'
}, {
  id: 501,
  name: 'One-end meter'
}, {
  id: 502,
  name: 'Center-out meter'
}, {
  id: 503,
  name: 'Light field'
}] as const);
export type RhythmMode = typeof RHYTHM_MODES[number]['id'];
export type RhythmSideMode = typeof RHYTHM_SIDE_MODES[number]['id'];
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
  const v = (input as RhythmConfiguration);
  const range = (n: number, low: number, high: number) => Number.isFinite(n) && n >= low && n <= high;
  if (v.version !== 1 || !RHYTHM_MODES.some(m => m.id === v.keyMode) || !RHYTHM_SIDE_MODES.some(m => m.id === v.sideMode) || typeof v.endpoint !== 'string' || !v.endpoint.length || v.endpoint.length > 512 || /[\r\n\0]/.test(v.endpoint) || !range(v.brightness, 0, 100) || !range(v.sensitivity, .1, 10) || !range(v.releaseMs, 0, 200) || !/^#[0-9a-f]{6}$/i.test(v.color) || !['fixed', 'rainbow', 'aurora', 'fire'].includes(v.palette) || !v.spectrum || !range(v.spectrum.db, 0, 100) || !['hann', 'hamming', 'blackman'].includes(v.spectrum.window) || !Number.isInteger(v.spectrum.spatialRadius) || !range(v.spectrum.spatialRadius, 0, 16)) {
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

/** Restore saved drafts without reactivating the removed Beat Pulse mode. */
export function restoreRhythm(input: unknown): RhythmConfiguration {
  if (input && typeof input === 'object' && (input as {
    keyMode?: unknown;
  }).keyMode === 430) {
    return validateRhythm({
      ...input,
      keyMode: 428
    });
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
    r1 = c; g1 = x; b1 = 0;
  } else if (hue < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (hue < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (hue < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (hue < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }
  const toByteHex = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0');
  return `#${toByteHex(r1)}${toByteHex(g1)}${toByteHex(b1)}`;
}

/**
 * Render a 68/84-key Rhythm Sync frame from either live Web Audio FFT/waveform data
 * or the built-in synth rhythm generator when `frequencyData` is null.
 * Always emits `#rrggbb` hex strings so frames can be streamed directly over XSYD `0x2A`.
 */
export function renderRhythmAudioFrame(
  config: RhythmConfiguration,
  timeMs: number,
  frequencyData?: Uint8Array | null,
  timeDomainData?: Uint8Array | null,
  model: HeroDeviceModelId = 'win68HeMax'
) {
  const board = getBoard(model);
  const t = timeMs / 1000;
  const phase = (t * 2) % 1;

  let level = Math.exp(-phase * 7) * (0.75 + 0.25 * Math.sin(t * 0.7));
  const colBins: number[] = Array(16).fill(0);

  if (frequencyData && frequencyData.length > 0) {
    const usableBins = Math.max(16, Math.min(frequencyData.length, Math.floor(frequencyData.length * 0.65)));
    const dbGain = 0.5 + (config.spectrum.db / 100) * 1.8;
    const sensGain = Math.max(0.2, config.sensitivity * 0.35);
    let energySum = 0;
    for (let c = 0; c < 16; c++) {
      const startBin = Math.floor(Math.pow(c / 16, 1.5) * (usableBins - 1));
      const endBin = Math.max(startBin + 1, Math.floor(Math.pow((c + 1) / 16, 1.5) * usableBins));
      let acc = 0;
      for (let b = startBin; b < endBin; b++) {
        acc += (frequencyData[b] ?? 0) / 255;
      }
      const avg = acc / Math.max(1, endBin - startBin);
      const boosted = Math.min(1, Math.pow(avg, 1.25) * dbGain * sensGain);
      colBins[c] = boosted;
      energySum += boosted;
    }
    level = Math.min(1, (energySum / 16) * 1.25);
    if (timeDomainData && timeDomainData.length > 0) {
      let rmsAcc = 0;
      for (let i = 0; i < timeDomainData.length; i++) {
        const centered = ((timeDomainData[i] ?? 128) - 128) / 128;
        rmsAcc += centered * centered;
      }
      const rms = Math.sqrt(rmsAcc / timeDomainData.length);
      level = Math.min(1, Math.max(level, rms * sensGain * 2.2));
    }
  } else {
    for (let c = 0; c < 16; c++) {
      const nx = c / 15;
      colBins[c] = Math.max(0, Math.min(1, Math.sin(nx * 9 + t * 3) * 0.4 + level * 0.6));
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

  const keys: Record<string, string> = {};
  const maxRowIndex = Math.max(1, board.rows.length - 1);
  board.rows.forEach((row, y) =>
    row.forEach((key, x) => {
      if (key.spacer) {
        return;
      }
      if (config.keyMode === 180) {
        keys[key.id] = '#000000';
        return;
      }
      const nx = x / Math.max(1, row.length - 1);
      const ny = y / maxRowIndex;
      const colIdx = Math.max(0, Math.min(15, Math.round(nx * 15)));
      const colEnergy = smoothedBins[colIdx] ?? level;
      let value = 0;
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
        case 172:
          value = ny > 1 - Math.exp(-((phase + nx * 0.7) % 1) * 7) * Math.max(0.25, level) ? 1 : 0;
          break;
        case 173:
          value = Math.hypot(nx - (0.5 + 0.3 * Math.sin(Math.floor(t * 3) * 2)), ny - 0.5) < level * 0.7 ? 1 : 0;
          break;
        case 428:
          value = ny >= 1 - colEnergy ? 1 : 0.02;
          break;
      }
      const hue =
        config.palette === 'fire'
          ? nx * 45
          : config.palette === 'aurora'
            ? 160 + nx * 120
            : (nx * 300 + t * 25) % 360;
      keys[key.id] =
        config.palette === 'fixed'
          ? '#' +
            [1, 3, 5]
              .map(i =>
                Math.round((parseInt(config.color.slice(i, i + 2), 16) * value * config.brightness) / 100)
                  .toString(16)
                  .padStart(2, '0')
              )
              .join('')
          : hslToHex(hue, 90, value * config.brightness * 0.5);
    })
  );
  const sideCount = board.capabilities.sideLedCount;
  const side = Array.from({ length: sideCount }, (_, i) => {
    const lit =
      config.sideMode === 501
        ? i < level * sideCount
        : config.sideMode === 502
          ? Math.abs(i - Math.floor((sideCount - 1) / 2)) < level * (sideCount / 2)
          : config.sideMode === 503;
    return lit ? hslToHex((t * 60 + i * 15) % 360, 85, level * config.brightness * 0.5) : '#181c20';
  });
  return {
    keys,
    side,
    level
  };
}

/** Illustrative demo & synth fallback. Emits `#rrggbb` hex colors for every key. */
export function rhythmDemo(config: RhythmConfiguration, timeMs: number, model: HeroDeviceModelId = 'hero68') {
  return renderRhythmAudioFrame(config, timeMs, null, null, model);
}
