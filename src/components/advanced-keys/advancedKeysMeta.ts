import { HERO68_KEY_LABEL_BY_ID } from '../../app/helpers';
import type { useI18n } from '../../i18n';
import type { AdvancedBinding, AdvancedKind } from '../../protocol/hero68/advanced';
import { remapLabel } from '../../protocol/hero68/remap';

export const ADVANCED_KIND_INFO: Record<
  AdvancedKind,
  {
    title: string;
    description: string;
  }
> = {
  SOCD: {
    title: 'SOCD',
    description: 'Pair two keys and choose which input takes priority when both are pressed.'
  },
  DKS: {
    title: 'Dynamic Keystroke (DKS)',
    description: 'Assign up to four actions to different points of a key press and release.'
  },
  MT: {
    title: 'Mod Tap',
    description: 'Two actions on one key. Hold for the first action, or tap for the second.'
  },
  TGL: {
    title: 'Toggle Key',
    description: 'Tap to lock an action on or off. Hold the key for normal press and release.'
  },
  MPT: {
    title: 'Multi-point Trigger (MPT)',
    description: 'Activate three actions at three different depths of a single key.'
  },
  END: {
    title: 'Release Action (END)',
    description: 'Keep the normal key press and send an additional action when you release it.'
  }
};

export const keyLabel = (key: string) => HERO68_KEY_LABEL_BY_ID[key] ?? key;

export const SOCD_OPTIONS = [
  {
    value: 1,
    title: 'Last input priority',
    desc: 'The last key pressed overrides the first.'
  },
  {
    value: 3,
    title: 'First key priority',
    desc: 'Key 1 wins whenever both keys are active.'
  },
  {
    value: 4,
    title: 'Second key priority',
    desc: 'Key 2 wins whenever both keys are active.'
  },
  {
    value: 0,
    title: 'Neutral',
    desc: 'Neither key is active while both are pressed.'
  }
];

export const XSYD_SOCD_OPTIONS = [
  {
    value: 0,
    verified: true,
    title: 'Last input priority',
    desc: 'The last key pressed overrides the first.'
  },
  {
    value: 1,
    verified: true,
    title: 'First key priority',
    desc: 'Key 1 wins whenever both keys are active.'
  },
  {
    value: 2,
    verified: true,
    title: 'Second key priority',
    desc: 'Key 2 wins whenever both keys are active.'
  },
  {
    value: 3,
    verified: true,
    title: 'Neutral',
    desc: 'Neither key is active while both are pressed.'
  }
];

export function bindingSummary(
  binding: AdvancedBinding,
  tr: ReturnType<typeof useI18n>['tr'],
  isWin68 = false
) {
  const actions = binding.actions.map(remapLabel);
  if (binding.kind === 'SOCD') {
    if (isWin68) {
      return tr(
        XSYD_SOCD_OPTIONS.find(o => o.value === binding.mode)?.title ?? 'Existing keyboard priority'
      );
    }
    return tr(
      SOCD_OPTIONS.find(o => o.value === binding.mode)?.title ?? 'Existing keyboard priority'
    );
  }
  if (binding.kind === 'MT') {
    return tr('Hold: {hold} · Tap: {tap}', {
      hold: actions[0],
      tap: actions[1]
    });
  }
  if (binding.kind === 'TGL') {
    return tr('Toggle: {action}', {
      action: actions[0]
    });
  }
  if (binding.kind === 'END') {
    return tr('On release: {action}', {
      action: actions[0]
    });
  }
  if (binding.kind === 'MPT') {
    return binding.thresholds
      .map((depth, i) => `${depth.toFixed(2)} mm: ${actions[i]}`)
      .join(' · ');
  }
  if (binding.kind === 'DKS') {
    return (
      actions.filter((_, i) => binding.states[i]?.some(Boolean)).join(' · ') ||
      tr('No actions assigned')
    );
  }
  return tr('Preserved from the keyboard; editing unavailable');
}
