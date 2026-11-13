import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { rolldown } from 'rolldown';

async function bundle(path) {
  const build = await rolldown({ input: path });
  try {
    const { output } = await build.generate({ format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
  } finally {
    await build.close();
  }
}

const helpers = await bundle('src/app/helpers.ts');
const sliderDrag = await bundle('src/app/components/sliderDrag.ts');

test('actuation vertical drag snaps cleanly to 0.05 mm steps instead of 0.04 mm across 99px and 112px tracks', () => {
  const fineScale = { kind: 'continuous', min: 0.1, max: 3.4, step: 0.01 };
  const dragScale = { kind: 'continuous', min: 0.1, max: 3.4, step: 0.05 };

  for (const trackSpanPx of [99, 112]) {
    const axis = { trackStartPx: 0, trackSpanPx, direction: 1 };
    const { session, jumpedValue } = sliderDrag.beginSliderDrag({
      pointerId: 1,
      currentValue: 0.1,
      currentRatio: 0,
      fineScale,
      dragScale,
      coordPx: 0,
      axis
    });
    assert.equal(jumpedValue, null);

    const emitted = [0.1];
    for (let px = 1; px <= trackSpanPx; px++) {
      const next = sliderDrag.updateSliderDrag(session, {
        fineScale,
        dragScale,
        coordPx: px,
        axis
      });
      if (next != null) {
        emitted.push(next);
      }
    }

    assert.equal(emitted[0], 0.1);
    assert.equal(emitted[emitted.length - 1], 3.4);
    for (let i = 1; i < emitted.length; i++) {
      const deltaUm = Math.round((emitted[i] - emitted[i - 1]) * 1000);
      assert.equal(
        deltaUm,
        50,
        `expected 0.05 mm increment on ${trackSpanPx}px track, got ${emitted[i - 1]} -> ${emitted[i]}`
      );
    }
  }
});

test('actuation drag keeps fine numeric value on thumb click jitter and jumps on track click', () => {
  const fineScale = { kind: 'continuous', min: 0.1, max: 3.4, step: 0.01 };
  const dragScale = { kind: 'continuous', min: 0.1, max: 3.4, step: 0.05 };
  const axis = { trackStartPx: 0, trackSpanPx: 112, direction: 1 };
  const startRatio = (0.12 - 0.1) / (3.4 - 0.1);
  const startY = startRatio * 112;

  const { session, jumpedValue } = sliderDrag.beginSliderDrag({
    pointerId: 2,
    currentValue: 0.12,
    currentRatio: startRatio,
    fineScale,
    dragScale,
    coordPx: startY,
    axis
  });
  assert.equal(jumpedValue, null);

  // Sub-2px click jitter on thumb must not alter 0.12.
  assert.equal(
    sliderDrag.updateSliderDrag(session, {
      fineScale,
      dragScale,
      coordPx: startY + 1,
      axis
    }),
    null
  );

  // Clicking empty track jumps immediately to nearest 0.05 step.
  const trackClick = sliderDrag.beginSliderDrag({
    pointerId: 3,
    currentValue: 0.1,
    currentRatio: 0,
    fineScale,
    dragScale,
    coordPx: 56,
    axis
  });
  assert.equal(trackClick.jumpedValue, 1.75);
});

test('rapid trigger standard drag follows pointer 1:1 across the full range', () => {
  const fineScale = { kind: 'discrete', values: helpers.RAPID_TRIGGER_VALUES_STANDARD };
  const axis = { trackStartPx: 8, trackSpanPx: 169, direction: 1 };

  const normalDrag = sliderDrag.beginSliderDrag({
    pointerId: 4,
    currentValue: 0.01,
    currentRatio: 0,
    fineScale,
    coordPx: 8,
    axis
  });
  assert.equal(normalDrag.jumpedValue, null);

  assert.equal(
    sliderDrag.updateSliderDrag(normalDrag.session, {
      fineScale,
      coordPx: 8 + 84.5,
      axis
    }),
    1.71
  );
  assert.equal(
    sliderDrag.updateSliderDrag(normalDrag.session, {
      fineScale,
      coordPx: 8 + 169,
      axis
    }),
    3.4
  );
  assert.equal(
    sliderDrag.updateSliderDrag(normalDrag.session, {
      fineScale,
      coordPx: 8,
      axis
    }),
    0.01
  );
});

test('HERO 68 XS 0.005 mm rapid trigger with 0.01 dragStep and vertical deadzone follow pointer 1:1', () => {
  const xsScale = { kind: 'discrete', values: helpers.RAPID_TRIGGER_VALUES_XS };
  const xsDragScale = {
    kind: 'discrete',
    values: helpers.RAPID_TRIGGER_VALUES_XS.filter(
      (v, index) => index === 0 || Math.round(v * 1000) % 10 === 0
    )
  };
  const rtAxis = { trackStartPx: 8, trackSpanPx: 169, direction: 1 };

  const xsDrag = sliderDrag.beginSliderDrag({
    pointerId: 5,
    currentValue: 0.005,
    currentRatio: 0,
    fineScale: xsScale,
    dragScale: xsDragScale,
    coordPx: 8,
    axis: rtAxis
  });
  assert.equal(
    sliderDrag.updateSliderDrag(xsDrag.session, {
      fineScale: xsScale,
      dragScale: xsDragScale,
      coordPx: 8 + 169,
      axis: rtAxis
    }),
    3.4
  );

  const dzScale = { kind: 'continuous', min: 0, max: 1, step: 0.01 };
  const dzAxis = { trackStartPx: 0, trackSpanPx: 92, direction: -1 };
  const dzDrag = sliderDrag.beginSliderDrag({
    pointerId: 6,
    currentValue: 0,
    currentRatio: 0,
    fineScale: dzScale,
    coordPx: 92,
    axis: dzAxis
  });
  assert.equal(
    sliderDrag.updateSliderDrag(dzDrag.session, {
      fineScale: dzScale,
      coordPx: 46,
      axis: dzAxis
    }),
    0.5
  );
  assert.equal(
    sliderDrag.updateSliderDrag(dzDrag.session, {
      fineScale: dzScale,
      coordPx: 0,
      axis: dzAxis
    }),
    1
  );
});

test('ActuationPage, RapidPage, and QuickSettingsPage configure expected dragStep values', () => {
  for (const file of ['src/pages/ActuationPage.tsx', 'src/pages/QuickSettingsPage.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(source.includes('dragStep={0.05}'), true, `${file} missing dragStep={0.05}`);
  }
  for (const file of ['src/pages/RapidPage.tsx', 'src/pages/QuickSettingsPage.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(source.includes('dragStep={0.01}'), true, `${file} missing dragStep={0.01}`);
  }
});
