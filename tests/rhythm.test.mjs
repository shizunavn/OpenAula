import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {rolldown} from 'rolldown'
async function bundle(input){const b=await rolldown({input,external:/^node:/});try{const {output}=await b.generate({format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {defaultRhythm,validateRhythm,restoreRhythm,rhythmDemo,renderRhythmAudioFrame,RHYTHM_MODES}=await bundle('src/keyboard/rhythm.ts')
const {nativeRhythmCommand}=await bundle('service/rhythm.ts')
const {HERO68_KEY_POSITIONS}=await bundle('src/protocol/hero68/keyPositions.ts')
test('rhythm defaults use low-latency controls and reject invalid persisted/API configuration',()=>{
  const c=defaultRhythm();assert.deepEqual(validateRhythm(c),c);assert.equal(c.releaseMs,80);assert.equal(c.spectrum.window,'hann');assert.equal(c.spectrum.db,35)
  for(const patch of [{version:2},{keyMode:168},{keyMode:430},{sideMode:507},{brightness:101},{sensitivity:0},{releaseMs:201},{color:'#xyzxyz'},{endpoint:'x\nstop'},{palette:'unknown'},{spectrum:{...c.spectrum,spatialRadius:1.5}},{spectrum:{...c.spectrum,window:'unknown'}},{brightness:NaN}])assert.throws(()=>validateRhythm({...c,...patch}))
  assert.equal(validateRhythm({...c,keyMode:169,sensitivity:.1}).sensitivity,.1)
})
test('native command preserves endpoint UTF-8 and all control fields, gates unverified side output',()=>{
  const c={...defaultRhythm(),endpoint:'Thiết bị âm thanh;test'};const fields=nativeRhythmCommand(c).slice(7).split(';');assert.equal(fields.length,14);assert.equal(Buffer.from(fields[13],'hex').toString('utf8'),c.endpoint);assert.equal(+fields[4],80)
  assert.throws(()=>nativeRhythmCommand({...c,keyMode:430}),/Invalid rhythm/)
  for(const sideMode of [501,502,503,504,505,506])assert.throws(()=>nativeRhythmCommand({...c,sideMode}),/not been verified/)
})
test('saved removed Beat Pulse migrates to Spectrum and web-synth migrates to default while new API commands reject 430',()=>{
  const old={...defaultRhythm(),keyMode:430,brightness:53,endpoint:'saved-speakers',color:'#abcdef',syncOffsetMs:-40,tempoMode:'target',tempoBpm:600}
  const migrated=restoreRhythm(old)
  assert.deepEqual(migrated,{...defaultRhythm(),brightness:53,endpoint:'saved-speakers',color:'#abcdef'})
  assert.equal(nativeRhythmCommand(migrated).slice(7).split(';')[0],'428')
  assert.equal(restoreRhythm({...defaultRhythm(),endpoint:'web-synth'}).endpoint,'default')
  assert.throws(()=>validateRhythm(old));assert.throws(()=>nativeRhythmCommand(old))
  assert.throws(()=>restoreRhythm({...old,keyMode:999}));assert.throws(()=>restoreRhythm({...old,brightness:101}))
  for(const mode of RHYTHM_MODES)assert.deepEqual(restoreRhythm({...defaultRhythm(),keyMode:mode.id}),validateRhythm({...defaultRhythm(),keyMode:mode.id}))
})
test('native color order exactly matches all web key IDs and real POS, including AltRight',()=>{
  const header=readFileSync('service/native/rhythm_core.h','utf8'),body=header.match(/positions\s*=\s*\{([^}]+)\}/)[1]
  const positions=body.split(',').map(Number).filter(Number.isFinite)
  assert.deepEqual(positions,Object.values(HERO68_KEY_POSITIONS));assert.equal(positions.length,68);assert.equal(new Set(positions).size,68)
})
test('illustrative demo covers every mode and all keys without hardware or hidden 168',()=>{
  assert.equal(RHYTHM_MODES.length,10);assert.ok(!RHYTHM_MODES.some(m=>m.id===430));assert.ok(!RHYTHM_MODES.some(m=>m.id===168))
  for(const mode of RHYTHM_MODES){const f=rhythmDemo({...defaultRhythm(),keyMode:mode.id},250);assert.deepEqual(Object.keys(f.keys),Object.keys(HERO68_KEY_POSITIONS));assert.equal(f.side.length,18);assert.ok(f.level>=0&&f.level<=1)}
  assert.ok(Object.values(rhythmDemo({...defaultRhythm(),keyMode:180,palette:'fixed'},0).keys).every(c=>c==='#000000'))
})
test('live renderRhythmAudioFrame stays 100% dark with 0% level across all modes when no audio or silence is playing',()=>{
  const silentFft=new Uint8Array(512)
  const silentWave=new Uint8Array(1024).fill(128)
  for(const mode of RHYTHM_MODES){
    const cfg={...defaultRhythm(),keyMode:mode.id,sideMode:503}
    const noSource=renderRhythmAudioFrame(cfg,500,null,null,'win68HeMax',false)
    assert.equal(noSource.level,0,`mode ${mode.id} with null audio must have level 0`)
    assert.ok(Object.values(noSource.keys).every(c=>c==='#000000'),`mode ${mode.id} with null audio must keep all keys #000000`)
    assert.ok(noSource.side.every(c=>c==='#181c20'),`mode ${mode.id} with null audio must keep side LEDs dark`)

    const zeroAudio=renderRhythmAudioFrame(cfg,500,silentFft,silentWave,'win68HeMax',false)
    assert.equal(zeroAudio.level,0,`mode ${mode.id} with silent audio must have level 0`)
    assert.ok(Object.values(zeroAudio.keys).every(c=>c==='#000000'),`mode ${mode.id} with silent audio must keep all keys #000000`)
    assert.ok(zeroAudio.side.every(c=>c==='#181c20'),`mode ${mode.id} with silent audio must keep side LEDs dark`)
  }
})
test('Spectrum Bars lights up top number row on strong bands and Audio Marquee / Radial Chase scale with music energy',()=>{
  const topRowIds=['Escape','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal','Backspace','Insert']
  const loudFft=new Uint8Array(512).fill(220)
  const loudWave=new Uint8Array(1024).map((_,i)=>i%2?220:36)
  const sbFrame=renderRhythmAudioFrame({...defaultRhythm(),keyMode:429},200,loudFft,loudWave,'win68HeMax',false)
  assert.ok(topRowIds.every(id=>sbFrame.keys[id]!=='#000000'),'Spectrum Bars must light the top number row when bands are strong')

  const lowFft=new Uint8Array(512).fill(45)
  const lowWave=new Uint8Array(1024).map((_,i)=>i%2?142:114)
  for(const modeId of [432,434]){
    const low=renderRhythmAudioFrame({...defaultRhythm(),keyMode:modeId},200,lowFft,lowWave,'win68HeMax',false)
    const high=renderRhythmAudioFrame({...defaultRhythm(),keyMode:modeId},200,loudFft,loudWave,'win68HeMax',false)
    const countLit=f=>Object.values(f.keys).filter(c=>c!=='#000000').length
    assert.ok(countLit(low)>0&&countLit(high)>countLit(low),`mode ${modeId} must light more keys on louder beats`)
  }
})
