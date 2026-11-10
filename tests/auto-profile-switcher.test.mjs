import assert from 'node:assert/strict';
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

const [
  switcherMod,
  executorMod,
  deviceReqMod,
  profileTypesMod,
  heroCodecMod,
  heroCommandsMod,
  xsydCodecMod
] = await Promise.all([
  bundle('service/profile/autoProfileSwitcher.ts'),
  bundle('service/profile/hardwareExecutor.ts'),
  bundle('service/deviceRequests.ts'),
  bundle('src/state/profileTypes.ts'),
  bundle('src/protocol/hero68/codec.ts'),
  bundle('src/protocol/hero68/commands.ts'),
  bundle('src/protocol/xsyd/codec.ts')
]);

const {
  AutoProfileSwitcher,
  matchesFilter,
  matchesLinkedAppRule,
  wildcardMatch,
  scanInstalledLinkableApps
} = switcherMod;
const {
  ZeroWearHardwareExecutor
} = executorMod;
const {
  validateAutoSwitchRequest
} = deviceReqMod;
const {
  clampUtf8String,
  decodeProfileShareCode,
  encodeProfileShareCode,
  extractDominantColorFromApp,
  utf8ByteLength
} = profileTypesMod;
const { buildReport, decodeReport } = heroCodecMod;
const { selectProfile } = heroCommandsMod;
const { xsydReport, xsydSelectProfileSlot } = xsydCodecMod;

function makeProfile(uid, name, linkedApps, options = {}) {
  return {
    metadata: {
      uid,
      name,
      color: options.color ?? '#ffd45c',
      icon: options.icon ?? 'fps',
      createdFor: options.createdFor ?? 'hero68',
      updatedAt: 1700000000000,
      executionMode: options.executionMode ?? 'slot-switch',
      mappedOnboardSlot: options.mappedOnboardSlot ?? 1,
      linkedApps
    },
    draft: options.draft ?? {}
  };
}

test('Rule Engine supports fnmatch wildcards, directory prefixes, windowTitle, and AllMatches/AnyMatches', () => {
  assert.equal(wildcardMatch('valorant-win64-shipping.exe', '*valorant*.exe'), true);
  assert.equal(wildcardMatch('cs2.exe', 'cs?.exe'), true);
  assert.equal(wildcardMatch('chrome.exe', '*valorant*.exe'), false);

  const cs2App = {
    pid: 4120,
    exe: 'cs2.exe',
    path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
    title: 'Counter-Strike 2'
  };

  assert.equal(matchesFilter(cs2App, { kind: 'processName', value: 'CS2.EXE' }), true);
  assert.equal(
    matchesFilter(cs2App, {
      kind: 'processDirectory',
      value: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive'
    }),
    true
  );
  assert.equal(
    matchesFilter(cs2App, { kind: 'windowTitle', value: '*Counter-Strike*' }),
    true
  );

  const ruleAnd = {
    id: 'r1',
    name: 'CS2 Strict',
    sourceType: 'custom',
    matchType: 'AllMatches',
    filters: [
      { kind: 'processName', value: 'cs2.exe' },
      { kind: 'windowTitle', value: 'Counter-Strike 2' }
    ]
  };
  assert.equal(matchesLinkedAppRule(cs2App, ruleAnd), true);
  assert.equal(
    matchesLinkedAppRule({ ...cs2App, title: 'Mozilla Firefox' }, ruleAnd),
    false
  );

  const ruleOr = {
    ...ruleAnd,
    matchType: 'AnyMatches'
  };
  assert.equal(
    matchesLinkedAppRule({ ...cs2App, title: 'Mozilla Firefox' }, ruleOr),
    true
  );
});

test('AutoProfileSwitcher enforces 800ms Debounce (Alt-Tab storm = 0 USB packets) and 3000ms Min-Dwell', async () => {
  let clockMs = 1000;
  const applied = [];

  const switcher = new AutoProfileSwitcher(
    async profile => {
      applied.push({ uid: profile.metadata.uid, at: clockMs });
      return { mode: 'slot-switch', packetsSent: 1 };
    },
    undefined,
    () => clockMs
  );

  const defaultProfile = makeProfile('onboard-0', 'Default Desktop', [], {
    mappedOnboardSlot: 0
  });
  const cs2Profile = makeProfile(
    'linked-cs2',
    'CS2 Pro',
    [
      {
        id: 'app-cs2',
        name: 'CS2',
        sourceType: 'steam',
        matchType: 'AllMatches',
        filters: [{ kind: 'processName', value: 'cs2.exe' }]
      }
    ],
    { mappedOnboardSlot: 1 }
  );
  const valProfile = makeProfile(
    'linked-val',
    'Valorant',
    [
      {
        id: 'app-val',
        name: 'Valorant',
        sourceType: 'disk',
        matchType: 'AllMatches',
        filters: [{ kind: 'processName', value: '*valorant*.exe' }]
      }
    ],
    { mappedOnboardSlot: 2 }
  );

  switcher.updateConfiguration({
    profiles: [cs2Profile, valProfile, defaultProfile],
    defaultProfileUid: 'onboard-0',
    enabled: true,
    revertToDefault: true
  });

  // Simulate rapid Alt+Tab across 6 windows within 1.5 seconds (each held < 800ms)
  const rapidApps = [
    'cs2.exe',
    'discord.exe',
    'valorant-win64-shipping.exe',
    'chrome.exe',
    'cs2.exe',
    'valorant-win64-shipping.exe'
  ];
  for (const exe of rapidApps) {
    clockMs += 250;
    await switcher.onForegroundPoll({
      pid: 100,
      exe,
      path: `C:\\Games\\${exe}`,
      title: exe
    });
  }
  assert.equal(
    applied.length,
    0,
    'Alt-Tab storm must emit 0 hardware switches before 800ms debounce'
  );

  // Hold Valorant continuously for >= 800ms -> should trigger switch #1
  clockMs += 450; // 450ms since Valorant candidate started
  await switcher.onForegroundPoll({
    pid: 102,
    exe: 'valorant-win64-shipping.exe',
    path: 'C:\\Riot Games\\valorant-win64-shipping.exe',
    title: 'VALORANT'
  });
  assert.equal(applied.length, 0);

  clockMs += 400; // 850ms >= 800ms debounce
  await switcher.onForegroundPoll({
    pid: 102,
    exe: 'valorant-win64-shipping.exe',
    path: 'C:\\Riot Games\\valorant-win64-shipping.exe',
    title: 'VALORANT'
  });
  assert.equal(applied.length, 1);
  assert.equal(applied[0].uid, 'linked-val');
  assert.equal(switcher.getTelemetry().switchCount, 1);
  assert.equal(switcher.getTelemetry().flashWritesSaved, 5);

  // Immediately focus CS2 and hold for 900ms (meets 800ms debounce, but < 3000ms minDwell!)
  clockMs += 100;
  await switcher.onForegroundPoll({
    pid: 101,
    exe: 'cs2.exe',
    path: 'C:\\Steam\\cs2.exe',
    title: 'CS2'
  });
  clockMs += 900; // 1000ms since last switch (< 3000ms minDwell)
  await switcher.onForegroundPoll({
    pid: 101,
    exe: 'cs2.exe',
    path: 'C:\\Steam\\cs2.exe',
    title: 'CS2'
  });
  assert.equal(
    applied.length,
    1,
    'Second switch must be held back until 3000ms minDwell expires'
  );

  // Advance clock past 3000ms minDwell -> CS2 switch now executes
  clockMs += 2100;
  await switcher.onForegroundPoll({
    pid: 101,
    exe: 'cs2.exe',
    path: 'C:\\Steam\\cs2.exe',
    title: 'CS2'
  });
  assert.equal(applied.length, 2);
  assert.equal(applied[1].uid, 'linked-cs2');
});

test('ZeroWearHardwareExecutor: HERO68 slot-switch sends only CMD 0x10, and diff ram-stream enforces 0x15->0x13->0x19->0x16 without 0x03/0x05', async () => {
  const executor = new ZeroWearHardwareExecutor();
  const sentPackets = [];
  const transport = {
    deviceModel: 'hero68',
    async sendReport(pkt) {
      sentPackets.push(pkt);
    }
  };

  // 1. Slot-switch mode (0 Flash table overwrites)
  const slotProfile = makeProfile('linked-fps', 'FPS Slot 1', [], {
    executionMode: 'slot-switch',
    mappedOnboardSlot: 1
  });
  const resSlot = await executor.executeAutoSwitch(slotProfile, transport);
  assert.equal(resSlot.mode, 'slot-switch');
  assert.equal(resSlot.packetsSent, 1);
  const decodedSlot = decodeReport(sentPackets[0]);
  assert.equal(decodedSlot.command, 0x10);
  assert.equal(decodedSlot.data[0], 1);

  // 2. RAM-Stream / Diff-based ApplyPlan mode
  sentPackets.length = 0;
  const ramProfile = makeProfile('linked-ram', 'Host RAM Stream', [], {
    executionMode: 'ram-stream',
    mappedOnboardSlot: 2,
    draft: {
      actuationByKey: { KeyW: 0.4, KeyA: 0.4, KeyS: 0.4, KeyD: 0.4 },
      rapidTriggerByKey: { KeyW: true, KeyA: true, KeyS: true, KeyD: true },
      rapidSensitivityByKey: { KeyW: 0.15, KeyA: 0.15, KeyS: 0.15, KeyD: 0.15 }
    }
  });
  const resRam = await executor.executeAutoSwitch(ramProfile, transport);
  assert.equal(resRam.mode, 'ram-stream');
  assert.ok(resRam.packetsSent > 0);

  const commandsSeen = sentPackets.map(p => decodeReport(p).command);
  // Verify no Remap (0x03), Macro (0x05), Advanced (0x12), or Profile Name (0x1A) packet is ever sent
  for (const forbidden of [0x03, 0x05, 0x12, 0x1a]) {
    assert.equal(commandsSeen.includes(forbidden), false);
  }
  // Verify strict command ordering: 0x15 (Switch) -> 0x13 (Actuation) -> 0x19 (RT) -> 0x16 (Deadzone)
  const first15 = commandsSeen.indexOf(0x15);
  const first13 = commandsSeen.indexOf(0x13);
  const first19 = commandsSeen.indexOf(0x19);
  const first16 = commandsSeen.indexOf(0x16);
  assert.ok(first15 >= 0 && first15 < first13, '0x15 Switch must precede 0x13 Actuation');
  assert.ok(first13 < first19, '0x13 Actuation must precede 0x19 Rapid Trigger');
  assert.ok(first19 < first16, '0x19 Rapid Trigger must precede 0x16 Deadzone');

  // Re-applying identical profile sends 0 packets (Diff-based deduplication)
  sentPackets.length = 0;
  const resRepeat = await executor.executeAutoSwitch(ramProfile, transport);
  assert.equal(resRepeat.packetsSent, 0);
});

test('ZeroWearHardwareExecutor: XSYD (WIN 68 HE MAX) uses 0x00 0x70 + SRAM 0x2A and strictly blocks 0x23/0x29 Flash-wear commands', async () => {
  const executor = new ZeroWearHardwareExecutor();
  const sentPackets = [];
  const transport = {
    deviceModel: 'win68HeMax',
    lastManualSaveAt: 1000,
    async sendReport(pkt) {
      sentPackets.push(pkt);
    }
  };

  const xsydProfile = makeProfile('linked-xsyd', 'XSYD Pro', [], {
    createdFor: 'win68HeMax',
    color: '#4ade80',
    mappedOnboardSlot: 2
  });

  // Attempting auto-switch within 600ms of manual save must be deferred to protect SRAM flush
  await assert.rejects(
    () => executor.executeAutoSwitch(xsydProfile, transport, 1300),
    { name: 'WriteBlockedError' }
  );

  // After 600ms guard expires, only 0x00 0x70 (Select Slot) and 0x2A (SRAM RGB without FE FE FE FE) are sent
  const res = await executor.executeAutoSwitch(xsydProfile, transport, 2000);
  assert.equal(res.mode, 'slot-switch');
  assert.equal(sentPackets.length, 2);
  assert.equal(sentPackets[0][0], 0x5c);
  assert.equal(sentPackets[0][2], 0x00);
  assert.equal(sentPackets[0][4], 0x70);
  assert.equal(sentPackets[0][5], 2);

  assert.equal(sentPackets[1][0], 0x5c);
  assert.equal(sentPackets[1][2], 0x2a);

  // Verify XSYD 0x23 and 0x29 are strictly blocked by validateAutoSwitchRequest
  assert.throws(
    () => validateAutoSwitchRequest(xsydReport(0x23, [0]), 'xsyd'),
    { name: 'WriteBlockedError' }
  );
  assert.throws(
    () => validateAutoSwitchRequest(xsydReport(0x29, [0]), 'xsyd'),
    { name: 'WriteBlockedError' }
  );
  // Verify 0x2A with Flash sentinel FE FE FE FE is blocked
  assert.throws(
    () => validateAutoSwitchRequest(xsydReport(0x2a, [0xfe, 0xfe, 0xfe, 0xfe]), 'xsyd'),
    { name: 'WriteBlockedError' }
  );
});

test('ByteTech dangerous commands and Keymap writes are blocked in Auto-Switch', () => {
  // ByteTech dangerous commands (0x11 Factory Reset, 0x7F Bootloader, 0x94 Calibration) and Keymap writes (0x03) blocked in Auto-Switch
  for (const cmd of [0x03, 0x05, 0x11, 0x12, 0x1a, 0x7f, 0x94]) {
    const pkt = buildReport({ command: cmd, zone: 0, data: [0] });
    assert.throws(() => validateAutoSwitchRequest(pkt, 'bytetech', true), {
      name: 'WriteBlockedError'
    });
  }
  assert.doesNotThrow(() =>
    validateAutoSwitchRequest(selectProfile(1), 'bytetech', false)
  );
  assert.doesNotThrow(() =>
    validateAutoSwitchRequest(xsydSelectProfileSlot(2), 'xsyd', false)
  );
});

test('Profile Share Code (OA2-...), UTF-8 55-byte name clamping, and Dominant App Color extraction', () => {
  const original = makeProfile(
    'linked-1',
    'Valorant Pro',
    [
      {
        id: 'app-1',
        name: 'VALORANT',
        sourceType: 'disk',
        matchType: 'AllMatches',
        filters: [{ kind: 'processName', value: 'VALORANT-Win64-Shipping.exe' }]
      }
    ],
    {
      color: extractDominantColorFromApp('VALORANT'),
      draft: { actuationByKey: { KeyW: 0.35 } }
    }
  );

  const code = encodeProfileShareCode(original);
  assert.match(code, /^OA2-/);
  const decoded = decodeProfileShareCode(code);
  assert.equal(decoded.metadata.name, 'Valorant Pro');
  assert.equal(decoded.metadata.color, '#f87171');
  assert.equal(decoded.metadata.linkedApps.length, 1);
  assert.equal(decoded.draft.actuationByKey.KeyW, 0.35);

  const longViName =
    'Hồ sơ chơi game tốc độ cao Counter-Strike 2 và Valorant siêu nhạy 2026';
  const clamped = clampUtf8String(longViName, 55);
  assert.ok(utf8ByteLength(clamped) <= 55);

  const scanned = scanInstalledLinkableApps();
  assert.ok(scanned.steamApps.length > 0);
  assert.ok(scanned.diskApps.length > 0);
});

test('XSYD Smart 4-Slot Virtualization handles 12+ profiles with Slot 3 Session Cache Hit (0 Flash wear on Alt-Tab) and Token-Bucket Wear Guard', async () => {
  let now = 10_000;
  const executor = new ZeroWearHardwareExecutor();
  const sentPackets = [];
  const transport = {
    deviceModel: 'win68HeMax',
    lastManualSaveAt: 0,
    async sendReport(pkt) {
      sentPackets.push(pkt);
    }
  };

  // Build 12 distinct profiles: 3 pinned (Slots 0..2) + 9 overflow games (#4..#12)
  const profiles = [];
  for (let i = 0; i < 12; i++) {
    const p = makeProfile(
      i < 3 ? `onboard-${i}` : `game-${i + 1}`,
      `Game Profile #${i + 1}`,
      [{ id: `r-${i}`, name: `Game ${i + 1}`, sourceType: 'custom', matchType: 'AllMatches', filters: [{ kind: 'processName', value: `game${i + 1}.exe` }] }],
      {
        tier: i < 3 ? 'onboard' : 'linked',
        mappedOnboardSlot: i < 3 ? i : 3,
        color: `#${((i + 1) * 19).toString(16).padStart(2, '0')}a0ff`,
        actuationMm: Number((0.4 + i * 0.15).toFixed(2)),
        rtEnabled: true
      }
    );
    p.draft.actuationByKey = { KeyW: Number((0.4 + i * 0.15).toFixed(2)) };
    p.draft.rapidTriggerByKey = { KeyW: true };
    profiles.push(p);
  }

  const switcher = new AutoProfileSwitcher(
    async profile => executor.executeAutoSwitch(profile, transport, now),
    undefined,
    () => now,
    async overflowProfile => executor.commitXsydSlot3Overflow(overflowProfile, transport, now),
    () => executor.getXsydSlot3State(now)
  );
  switcher.updateConfiguration({
    profiles,
    defaultProfileUid: 'onboard-0',
    enabled: true,
    revertToDefault: true
  });

  // 1. User opens Game #8 (Overflow Profile -> Slot 3 Cache Miss -> Warm-up)
  const app8 = { pid: 800, exe: 'game8.exe', path: 'C:\\Games\\game8.exe', title: 'Game 8' };
  await switcher.onForegroundPoll(app8);
  now += 900; // pass 800ms debounce
  const switchedTo8 = await switcher.onForegroundPoll(app8);
  assert.equal(switchedTo8, true);
  assert.equal(switcher.getTelemetry().lastSwitchMode, 'xsyd-slot3-warmup');

  // Verify ONLY 0x00 0x70 0x03 + 0x2A SRAM RGB were sent during Warm-up (ZERO 0x23 Flash-wear packets!)
  assert.equal(sentPackets.some(p => p[2] === 0x23), false);

  // 2. If user briefly Alt-Tabs away after 4 seconds (< 12s warm-up), warm-up is cancelled with 0 Flash writes!
  now += 4000;
  const desktopApp = { pid: 100, exe: 'explorer.exe', path: 'C:\\Windows\\explorer.exe', title: 'Desktop' };
  await switcher.onForegroundPoll(desktopApp);
  now += 900;
  await switcher.onForegroundPoll(desktopApp);
  assert.equal(sentPackets.some(p => p[2] === 0x23), false);

  // 3. User returns to Game #8 and plays continuously for >= 12s -> Session Commit into Slot 3
  now += 3500;
  await switcher.onForegroundPoll(app8);
  now += 900;
  await switcher.onForegroundPoll(app8); // enters warm-up
  assert.equal(sentPackets.some(p => p[2] === 0x23), false);

  now += 12_500; // 12.5 seconds of active gameplay in Game #8
  const committed8 = await switcher.onForegroundPoll(app8);
  assert.equal(committed8, true);
  assert.equal(switcher.getTelemetry().lastSwitchMode, 'xsyd-slot3-committed');
  const writePacketsAfterCommit = sentPackets.filter(p => p[2] === 0x23).length;
  assert.ok(writePacketsAfterCommit > 0, 'Expected Slot 3 session commit after 12s continuous gameplay');
  assert.equal(executor.getXsydSlot3State(now).cachedProfileUid, 'game-8');

  // 4. Now user Alt-Tabs 10 times between Game #8 and Desktop/Pinned Game #2!
  //    Every return to Game #8 MUST be an instant Slot 3 Cache Hit with ZERO additional 0x23 packets!
  sentPackets.length = 0;
  for (let cycle = 0; cycle < 5; cycle++) {
    now += 4000;
    await switcher.onForegroundPoll(desktopApp);
    now += 900;
    await switcher.onForegroundPoll(desktopApp);

    now += 4000;
    await switcher.onForegroundPoll(app8);
    now += 900;
    const hit = await switcher.onForegroundPoll(app8);
    assert.equal(hit, true);
    assert.equal(switcher.getTelemetry().lastSwitchMode, 'xsyd-slot3-cache-hit');
  }
  assert.equal(
    sentPackets.filter(p => p[2] === 0x23).length,
    0,
    'Slot 3 Cache Hit must send 0 Flash-wear (0x23) packets across repeated Alt-Tabs!'
  );
  assert.equal(executor.getXsydSlot3State(now).cacheHits, 5);
});
