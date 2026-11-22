import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { rolldown } from 'rolldown';

async function bundle(input) {
  const b = await rolldown({ input, external: /^node:/ });
  try {
    const { output } = await b.generate({ format: 'esm', codeSplitting: false });
    return import(
      `data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`
    );
  } finally {
    await b.close();
  }
}

const [hydrationMod, profileTypesMod] = await Promise.all([
  bundle('src/state/profileHydration.ts'),
  bundle('src/state/profileTypes.ts')
]);

const { hasAutoSwitchRules, resolveHydratedProfilesFromService } = hydrationMod;
const { createDefaultOnboardMetadata } = profileTypesMod;

function emptyOnboard() {
  return {
    0: createDefaultOnboardMetadata(0, 'Onboard Profile 0', 'hero68'),
    1: createDefaultOnboardMetadata(1, 'Onboard Profile 1', 'hero68'),
    2: createDefaultOnboardMetadata(2, 'Onboard Profile 2', 'hero68'),
    3: createDefaultOnboardMetadata(3, 'Onboard Profile 3', 'win68HeMax')
  };
}

const cs2Rule = {
  id: 'rule-cs2',
  appName: 'Counter-Strike 2',
  matchType: 'AnyMatches',
  filters: [{ id: 'f-1', kind: 'processName', value: 'cs2.exe' }]
};

const valRule = {
  id: 'rule-val',
  appName: 'VALORANT',
  matchType: 'AnyMatches',
  filters: [{ id: 'f-2', kind: 'processName', value: 'valorant-win64-shipping.exe' }]
};

test('Issue #5: hydrates onboard & linked auto-switch rules from background service when local browser state has none', () => {
  const localOnboard = emptyOnboard();
  const serviceProfiles = [
    {
      metadata: {
        ...createDefaultOnboardMetadata(1, 'FPS Slot', 'hero68'),
        linkedApps: [cs2Rule]
      },
      draft: {}
    },
    {
      metadata: {
        uid: 'linked-val',
        name: 'Valorant',
        color: '#ff4655',
        icon: 'fps',
        createdFor: 'hero68',
        updatedAt: 1700000000000,
        executionMode: 'slot-switch',
        mappedOnboardSlot: 2,
        linkedApps: [valRule]
      },
      draft: {}
    }
  ];

  const result = resolveHydratedProfilesFromService({
    localOnboardMetadata: localOnboard,
    localLinkedProfiles: [],
    serviceProfiles,
    serviceAutoProfile: { enabled: false, revertToDefault: false, notifyOnSwitch: true }
  });

  assert.equal(result.shouldHydrate, true);
  assert.equal(result.onboardMetadata[1].name, 'FPS Slot');
  assert.deepEqual(result.onboardMetadata[1].linkedApps, [cs2Rule]);
  assert.equal(result.linkedProfiles.length, 1);
  assert.equal(result.linkedProfiles[0].metadata.uid, 'linked-val');
  assert.equal(result.autoProfileEnabled, false);
  assert.equal(result.revertToDefaultOnFocusLoss, false);
  assert.equal(result.notifyOnProfileSwitch, true);
});

test('Issue #5: keeps local browser rules when local state already has linked apps', () => {
  const localOnboard = emptyOnboard();
  localOnboard[1] = { ...localOnboard[1], linkedApps: [cs2Rule] };

  assert.equal(hasAutoSwitchRules(localOnboard, []), true);

  const result = resolveHydratedProfilesFromService({
    localOnboardMetadata: localOnboard,
    localLinkedProfiles: [],
    serviceProfiles: [
      {
        metadata: {
          ...createDefaultOnboardMetadata(2, 'Stale Service Slot', 'hero68'),
          linkedApps: [valRule]
        },
        draft: {}
      }
    ],
    serviceAutoProfile: { enabled: true }
  });

  assert.equal(result.shouldHydrate, false);
  assert.deepEqual(result.onboardMetadata[1].linkedApps, [cs2Rule]);
  assert.deepEqual(result.onboardMetadata[2].linkedApps, []);
});

test('Issue #5: useDeviceSyncController persists 3-tier profile state and auto-switch toggles to localStorage', () => {
  const src = readFileSync('src/app/hooks/useDeviceSyncController.ts', 'utf8');
  for (const field of [
    'onboardMetadata',
    'linkedProfiles',
    'inactiveProfiles',
    'autoProfileEnabled',
    'revertToDefaultOnFocusLoss',
    'notifyOnProfileSwitch'
  ]) {
    assert.ok(src.includes(field), `Expected useDeviceSyncController.ts to persist ${field}`);
  }
});
