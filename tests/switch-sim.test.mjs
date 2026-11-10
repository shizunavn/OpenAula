import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { rolldown } from 'rolldown';

const require = createRequire(import.meta.url);

async function loadBundleCjs(inputPath) {
  const bundle = await rolldown({
    input: inputPath,
    plugins: [
      {
        name: 'test-stubs',
        resolveId(source) {
          if (
            source.endsWith('.css') ||
            source.endsWith('.webp') ||
            source.endsWith('.png') ||
            source.endsWith('.jpg') ||
            source.endsWith('.svg')
          ) {
            return '\0stub';
          }
          return null;
        },
        load(id) {
          if (id === '\0stub') return 'export default "";';
          return null;
        }
      }
    ]
  });
  const { output } = await bundle.generate({ format: 'cjs' });
  await bundle.close();
  const fn = new Function('require', 'module', 'exports', output[0].code);
  const mod = { exports: {} };
  fn(require, mod, mod.exports);
  return mod.exports;
}

test('SwitchSim physics, SwitchTriggerTracker, and switch configs work accurately', async () => {
  const mod = await loadBundleCjs('src/app/switchSim.ts');
  const { SwitchSim, SwitchTriggerTracker, resolveSwitchSimConfig, SWITCH_SIM_BY_PROFILE, TRAVEL } =
    mod;

  assert.equal(TRAVEL, 3.4);

  // 1. Physics press & release
  const sim = new SwitchSim({ Fpre: 35, Fbot: 50, mu: 2.2, T: 3.4 });
  assert.equal(sim.x, 0);
  sim.press();
  sim.update(0.04);
  assert.ok(sim.x > 2.5, `Expected switch to press deep, got ${sim.x}`);
  assert.ok(sim.springF(sim.x) > 45);

  sim.release();
  sim.update(0.05);
  sim.update(0.05);
  assert.ok(sim.x < 0.2, `Expected switch to return near 0, got ${sim.x}`);

  // 2. Drag to exact depth
  sim.drag(1.65);
  sim.update(0.04);
  assert.ok(Math.abs(sim.x - 1.65) < 0.08, `Expected switch near 1.65mm, got ${sim.x}`);

  // 3. Trigger tracker — standard Actuation Point + Dead Zone + Rapid Trigger
  const tracker = new SwitchTriggerTracker();
  const baseCfg = {
    travelMm: 3.4,
    actuationMm: 1.2,
    rapidTrigger: false,
    deadzoneEnabled: true,
    topDeadzone: 0.2,
    bottomDeadzone: 0.2
  };
  assert.equal(tracker.evaluate(0.5, baseCfg), false);
  assert.equal(tracker.evaluate(1.25, baseCfg), true);
  assert.equal(tracker.evaluate(1.15, baseCfg), false);

  // Rapid Trigger mode
  const rtCfg = {
    travelMm: 3.4,
    actuationMm: 1.0,
    rapidTrigger: true,
    splitSensitivity: true,
    pressSensitivity: 0.3,
    releaseSensitivity: 0.4,
    deadzoneEnabled: true,
    topDeadzone: 0.15,
    bottomDeadzone: 0.15
  };
  tracker.reset();
  assert.equal(tracker.evaluate(0.8, rtCfg), false);
  assert.equal(tracker.evaluate(1.1, rtCfg), true); // crosses AP
  assert.equal(tracker.evaluate(2.4, rtCfg), true); // peak = 2.4
  assert.equal(tracker.evaluate(2.1, rtCfg), true); // lifted 0.3 < 0.4 releaseSensitivity
  assert.equal(tracker.evaluate(1.95, rtCfg), false); // lifted 0.45 >= 0.4 -> RT reset!
  assert.equal(tracker.evaluate(2.15, rtCfg), false); // pressed 0.20 < 0.3 pressSensitivity
  assert.equal(tracker.evaluate(2.28, rtCfg), true); // pressed 0.33 >= 0.3 -> RT re-trigger!

  // 4. All OpenAula switch profile configs exist
  for (const id of [
    'clear',
    'white',
    'black',
    'blue',
    'switch-1',
    'switch-3',
    'switch-4',
    'switch-14',
    'switch-37',
    'switch-59',
    'switch-60',
    'switch-61',
    'switch-62',
    'switch-76'
  ]) {
    assert.ok(SWITCH_SIM_BY_PROFILE[id], `Missing config for ${id}`);
    const resolved = resolveSwitchSimConfig({ id, name: id, front: `${id}.png` });
    assert.ok(resolved.rects.length >= 3);
    assert.equal(resolved.spring.length, 4);
  }
});

test('ActuationPage, QuickSettingsPage, and SwitchSimPreview bundle and load cleanly', async () => {
  const simPreviewMod = await loadBundleCjs('src/app/components/SwitchSimPreview.tsx');
  const actuationMod = await loadBundleCjs('src/pages/ActuationPage.tsx');
  const quickMod = await loadBundleCjs('src/pages/QuickSettingsPage.tsx');

  assert.equal(typeof simPreviewMod.SwitchSimPreview, 'function');
  assert.equal(typeof actuationMod.ActuationPage, 'function');
  assert.equal(typeof quickMod.QuickSettingsPage, 'function');
});
