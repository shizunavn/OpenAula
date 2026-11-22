import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

async function load(path) {
  const build = await rolldown({ input: path })
  try {
    const { output } = await build.generate({ format: 'esm' })
    return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  } finally {
    await build.close()
  }
}

test('useSlotHistory core helpers support undo, redo, burst commit, and slot isolation', async () => {
  const {
    createEmptySlotHistories,
    draftEditableFingerprint,
    pushSlotHistoryCommit,
    stepSlotUndo,
    stepSlotRedo,
  } = await load('src/app/hooks/useSlotHistory.ts')

  const histories = createEmptySlotHistories()
  const makeDraft = actuation => ({
    assignedSwitchesByKey: { KeyW: 'white' },
    actuationByKey: { KeyW: actuation },
    rapidTriggerByKey: { KeyW: false },
    splitSensitivityByKey: {},
    rapidSensitivityByKey: {},
    pressSensitivityByKey: {},
    releaseSensitivityByKey: {},
    deadzoneEnabledByKey: {},
    topDeadzoneByKey: {},
    bottomDeadzoneByKey: {},
    remapLayers: { 0: {}, 1: {}, 2: {} },
    advancedBindings: [],
    dirtyKeys: [],
    dirtyRemaps: [],
  })

  const d1 = makeDraft(1.6)
  const d2 = makeDraft(0.8)
  const d3 = makeDraft(0.4)

  const slot0 = histories[0]
  slot0.committed = structuredClone(d1)
  slot0.committedFp = draftEditableFingerprint(d1)

  // First edit burst
  slot0.pendingBeforeBurst = slot0.committed
  pushSlotHistoryCommit(slot0, d2, draftEditableFingerprint(d2))
  assert.equal(slot0.past.length, 1)
  assert.equal(slot0.committed.actuationByKey.KeyW, 0.8)

  // Second edit burst
  slot0.pendingBeforeBurst = slot0.committed
  pushSlotHistoryCommit(slot0, d3, draftEditableFingerprint(d3))
  assert.equal(slot0.past.length, 2)
  assert.equal(histories[1].past.length, 0)

  // Undo twice
  const u1 = stepSlotUndo(slot0)
  assert.equal(u1.actuationByKey.KeyW, 0.8)
  const u2 = stepSlotUndo(slot0)
  assert.equal(u2.actuationByKey.KeyW, 1.6)
  assert.equal(stepSlotUndo(slot0), null)

  // Redo once
  const r1 = stepSlotRedo(slot0)
  assert.equal(r1.actuationByKey.KeyW, 0.8)
  assert.equal(slot0.future.length, 1)
})
