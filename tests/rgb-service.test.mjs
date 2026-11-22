import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'
const build=await rolldown({input:'service/frame.ts'})
const {output}=await build.generate({format:'esm'});await build.close()
const {framePackets,RgbFrameEncoder}=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
const keys=['Escape','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal','Backspace','Insert','Tab','KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Backslash','Delete','CapsLock','KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote','Enter','PageUp','ShiftLeft','KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash','ShiftRight','ArrowUp','PageDown','ControlLeft','MetaLeft','AltLeft','Space','AltRight','Fn','ControlRight','ArrowLeft','ArrowDown','ArrowRight']
function unpack(packets){const body=packets.flatMap(p=>[...p.slice(7,7+p[6])]);const groups=[];for(let i=0;i<body.length;){const color=body.slice(i,i+3),n=body[i+3];assert.ok(n>0);groups.push({color,ids:body.slice(i+4,i+4+n)});i+=4+n;assert.ok(i<=body.length)}return {body,groups}}
test('live frames cover all 68 keys exactly once with POS IDs and valid packet checksums',()=>{
  const p=framePackets(Object.fromEntries(keys.map(id=>[id,'#123456']))),{groups}=unpack(p)
  assert.equal(p.length,2);assert.equal(groups.length,1);assert.deepEqual(groups[0].color,[18,52,86]);assert.equal(groups[0].ids.length,68)
  assert.equal(groups[0].ids[keys.indexOf('KeyW')],30);assert.equal(groups[0].ids[keys.indexOf('Fn')],72)
  p.forEach((v,i)=>{assert.equal(v.length,64);assert.equal(v[4],p.length);assert.equal(v[5],i);assert.equal(v.reduce((a,b)=>a+b,0)&255,255)})
})
test('68 distinct colors cannot overflow firmware aggregate byte counter',()=>{
  const p=framePackets(Object.fromEntries(keys.map((id,i)=>[id,'#'+[i*3,(i*17)%256,(i*53)%256].map(c=>c.toString(16).padStart(2,'0')).join('')])))
  const {body,groups}=unpack(p);assert.ok(body.length<=196);assert.ok(groups.length<=32);assert.ok(p.length<=4)
  const ids=groups.flatMap(g=>g.ids);assert.equal(ids.length,68);assert.equal(new Set(ids).size,68)
})
test('up to 32 unique colors are preserved exactly',()=>{
  const frame=Object.fromEntries(keys.map((id,i)=>[id,i%2?'#ff0000':'#00ff00'])),{groups}=unpack(framePackets(frame))
  assert.equal(groups.length,2);for(const g of groups)assert.ok(['255,0,0','0,255,0'].includes(g.color.join(',')))
})
test('incomplete or invalid frame fails before HID output',()=>{assert.throws(()=>framePackets({}));assert.throws(()=>framePackets(Object.fromEntries(keys.map(id=>[id,'#zzzzzz']))))})
test('palette reduction preserves unlit keys and responds immediately to an entirely new color',()=>{
  const encoder=new RgbFrameEncoder(),frame=Object.fromEntries(keys.map((id,i)=>[id,i===0?'#000000':'#'+[i*3,(i*17)%256,(i*53)%256].map(c=>c.toString(16).padStart(2,'0')).join('')]))
  assert.equal(encoder.prepare(frame).keys.Escape,'#000000')
  const still=encoder.prepare(frame).keys
  for(let i=0;i<20;i++)assert.deepEqual(encoder.prepare({...frame}).keys,still,'unchanged colors cannot flicker')
  const red=Object.fromEntries(keys.map(id=>[id,'#ff0000']));assert.deepEqual(encoder.prepare(red).keys,red)
  const off=Object.fromEntries(keys.map(id=>[id,'#000000']));assert.deepEqual(encoder.prepare(off).keys,off)
})
test('packed Aurora gradients remain stable between ticks within the packet limit',async()=>{
  const b=await rolldown({input:'src/keyboard/customRgb.ts'}),c=await b.generate({format:'esm'});await b.close()
  const {CustomRgbEngine,defaultCustomRgb}=await import(`data:text/javascript;base64,${Buffer.from(c.output[0].code).toString('base64')}`)
  const r=await rolldown({input:'src/protocol/hero68/rgb.ts'}),d=await r.generate({format:'esm'});await r.close()
  const {defaultRgb}=await import(`data:text/javascript;base64,${Buffer.from(d.output[0].code).toString('base64')}`)
  const p=defaultRgb();p.custom=defaultCustomRgb(p);p.custom.baseEffect={effect:'aurora',palette:'aurora',width:2.5,speed:.5};p.custom.base.mix=true
  const engine=new CustomRgbEngine(p),encoder=new RgbFrameEncoder(),rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))
  let previous,maxJump=0
  for(let t=110;t<5110;t+=25){
    engine.advance(t);const raw=engine.frame().keys,result=encoder.prepare(raw)
    assert.equal(Object.keys(result.keys).length,68);assert.ok(new Set(Object.values(result.keys)).size<=32);assert.ok(result.packets.length<=4)
    for(const id of keys){if(previous)maxJump=Math.max(maxJump,...rgb(result.keys[id]).map((v,i)=>Math.abs(v-rgb(previous[id])[i])))}
    previous=result.keys
  }
  assert.ok(maxJump<=16,`palette caused a ${maxJump}-level color jump`)
})

test('encoded Multicolor Scan over Aurora stays continuous at turns and within the HID packet budget',async()=>{
  async function load(input){const b=await rolldown({input});try{const c=await b.generate({format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(c.output[0].code).toString('base64')}`)}finally{await b.close()}}
  const {CustomRgbEngine,defaultCustomRgb,createRgbLayer,CUSTOM_RGB_COORDINATES}=await load('src/keyboard/customRgb.ts')
  const {defaultRgb}=await load('src/protocol/hero68/rgb.ts')
  const p=defaultRgb();p.custom=defaultCustomRgb(p);p.custom.baseEffect={effect:'aurora',palette:'aurora',width:2.5,speed:.5};p.custom.base.mix=true
  const layer=createRgbLayer('scan','scan');layer.multicolor=true;p.custom.layers=[layer]
  const x=Object.values(CUSTOM_RGB_COORDINATES).map(point=>point[0]),halfCycle=(Math.max(...x)-Math.min(...x))/layer.speed*1000
  const engine=new CustomRgbEngine(p),encoder=new RgbFrameEncoder(),rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))
  for(const turn of [halfCycle,2*halfCycle,3*halfCycle,4*halfCycle]){
    let previous,maxJump=0
    for(let offset=-3;offset<=3;offset++){
      engine.advance(turn+offset*1000/60);const result=encoder.prepare(engine.frame().keys)
      assert.ok(new Set(Object.values(result.keys)).size<=32);assert.ok(result.packets.length<=4)
      if(previous)for(const id of keys)maxJump=Math.max(maxJump,...rgb(result.keys[id]).map((v,i)=>Math.abs(v-rgb(previous[id])[i])))
      previous=result.keys
    }
    assert.ok(maxJump<=24,`encoded turn caused a ${maxJump}-level jump`)
  }
})

test('rgbController.stop({ persist: false }) preserves custom and rhythm modes across restart while explicit stop persists onboard', async () => {
  const { mkdtempSync, rmSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  const { createServiceContext } = await (async () => {
    const b = await rolldown({ input: 'service/context.ts', external: /^node:/ })
    try {
      const c = await b.generate({ format: 'esm' })
      return import(`data:text/javascript;base64,${Buffer.from(c.output[0].code).toString('base64')}`)
    } finally {
      await b.close()
    }
  })()
  const { createRgbController } = await (async () => {
    const b = await rolldown({ input: 'service/rgb/rgbController.ts', external: /^node:/ })
    try {
      const c = await b.generate({ format: 'esm' })
      return import(`data:text/javascript;base64,${Buffer.from(c.output[0].code).toString('base64')}`)
    } finally {
      await b.close()
    }
  })()

  const stateDir = mkdtempSync(path.join(tmpdir(), 'openaula-rgb-persist-'))
  try {
    const stubBridge = {
      stopCustom: async () => {},
      stopRhythm: async () => {},
      startCustom: async () => {},
      configureRhythm: async () => {},
      request: async () => ({ command: 8, zone: 2, data: [] }),
      syncModel: async () => {},
      queueFrame: async () => {},
    }
    const makeController = ctx =>
      createRgbController({
        ctx,
        getBridge: () => stubBridge,
        exclusive: fn => fn(),
        syncHall: async () => {},
        onRgbStateChange: () => {},
      })

    // 1. Custom mode survives shutdown stop({ persist: false })
    const ctx1 = createServiceContext({ stateDir, log: () => {} })
    ctx1.mode = 'custom'
    ctx1.savedMode = 'custom'
    ctx1.persist()
    const ctrl1 = makeController(ctx1)
    await ctrl1.stop({ persist: false })
    const savedCustom = JSON.parse(readFileSync(path.join(stateDir, 'preset.json'), 'utf8'))
    assert.equal(savedCustom.mode, 'custom')
    assert.equal(savedCustom.enabled, true)
    const reloadedCustom = createServiceContext({ stateDir, log: () => {} })
    assert.equal(reloadedCustom.mode, 'custom')

    // 2. Rhythm mode survives shutdown stop({ persist: false })
    reloadedCustom.mode = 'rhythm'
    reloadedCustom.savedMode = 'rhythm'
    reloadedCustom.persist()
    const ctrl2 = makeController(reloadedCustom)
    await ctrl2.stop({ persist: false })
    const reloadedRhythm = createServiceContext({ stateDir, log: () => {} })
    assert.equal(reloadedRhythm.mode, 'rhythm')

    // 3. Explicit user stop({ persist: true }) persists onboard
    const ctrl3 = makeController(reloadedRhythm)
    await ctrl3.stop({ persist: true })
    const reloadedOnboard = createServiceContext({ stateDir, log: () => {} })
    assert.equal(reloadedOnboard.mode, 'onboard')
  } finally {
    rmSync(stateDir, { recursive: true, force: true })
  }
})
