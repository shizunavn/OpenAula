import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function bundle(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {Hero68DeviceManager}=await bundle('src/protocol/hero68/webhid.ts')
const {buildReport,decodeReport}=await bundle('src/protocol/hero68/codec.ts')

async function withDevice(run){
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldWindow=globalThis.window
  const listeners=new Set(),sent=[]
  let respond=()=>{},busy=0,maximum=0
  const device={opened:false,vendorId:0x372e,productId:0x103e,async open(){this.opened=true},async close(){this.opened=false},addEventListener(_type,listener){listeners.add(listener)},removeEventListener(_type,listener){listeners.delete(listener)},async sendReport(_id,data){
    const request=decodeReport(Uint8Array.from([9,...new Uint8Array(data)]));sent.push(request)
    maximum=Math.max(maximum,++busy)
    setTimeout(()=>{busy--;respond(request)},2)
  }}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{hid:{async getDevices(){return [device]}}}})
  globalThis.window={setTimeout,clearTimeout}
  function reply(command,data,zone=0){const packet=buildReport({command,data,zone});for(const listener of listeners)listener({reportId:9,data:new DataView(packet.buffer,1,63)})}
  const manager=new Hero68DeviceManager()
  try{
    // connect() asks the board for its UUID; answer like a HERO68.
    respond=request=>{if(request.command===0x82)reply(0x82,[0x11,0,0,0,0,0x03],1)}
    await manager.connect(false)
    respond=()=>{}
    await run({manager,sent,reply,setRespond(fn){respond=fn},max(){return maximum}})
  }
  finally{await manager.disconnect();globalThis.window=oldWindow;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator}
}

test('direct HID serializes concurrent reads with identical commands',()=>withDevice(async({manager,setRespond,reply,max})=>{
  setRespond(request=>reply(request.command,Array.from(request.data)))
  const reports=await Promise.all([1,2,3].map(value=>manager.request(buildReport({command:0x90,data:[value]}),0x90,0,100)))
  assert.deepEqual(reports.map(r=>r.data[0]),[1,2,3]);assert.equal(max(),1)
}))
test('connect reads the model UUID instead of trusting the product name',async()=>{
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldWindow=globalThis.window
  // productName claims HERO 68; only the UUID may decide, so the answer must be
  // hero84 (the UUID) and must be marked as UUID-derived.
  const listeners=new Set()
  const device={opened:false,vendorId:0x372e,productId:0x103e,productName:'AULA HERO 68 HE',collections:[],async open(){this.opened=true},async close(){this.opened=false},addEventListener(_type,listener){listeners.add(listener)},removeEventListener(_type,listener){listeners.delete(listener)},async sendReport(){const packet=buildReport({command:0x82,zone:1,data:[0x11,0,0,0,0,0x05]});for(const listener of listeners)listener({reportId:9,data:new DataView(packet.buffer,1,63)})}}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{hid:{async getDevices(){return [device]}}}})
  globalThis.window={setTimeout,clearTimeout}
  const manager=new Hero68DeviceManager()
  try{
    await manager.connect(false)
    assert.equal(manager.getSnapshot().detectedModel,'hero84')
    assert.equal(manager.getSnapshot().detectedModelFromUuid,true)
    assert.equal(await manager.detectConnectedModel(),'hero84')
  }finally{await manager.disconnect();globalThis.window=oldWindow;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator}
})
test('connect resolves HERO 68 XS paired via 8K wireless receiver sub-device UUID (0x82 zone 0x09)',async()=>{
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldWindow=globalThis.window
  const listeners=new Set()
  const device={opened:false,vendorId:0x372e,productId:0x106c,productName:'8K Wireless Receiver',collections:[],async open(){this.opened=true},async close(){this.opened=false},addEventListener(_type,listener){listeners.add(listener)},removeEventListener(_type,listener){listeners.delete(listener)},async sendReport(_id,data){
    const request=decodeReport(Uint8Array.from([9,...new Uint8Array(data)]))
    const packet=request.zone===0x09
      ? buildReport({command:0x82,zone:0x09,data:[0x12,0,0,0,0,0x10,0x01,0x01]})
      : buildReport({command:0x82,zone:1,data:[0x22,0,0,0,0,0x10]})
    for(const listener of listeners)listener({reportId:9,data:new DataView(packet.buffer,1,63)})
  }}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{hid:{async getDevices(){return [device]}}}})
  globalThis.window={setTimeout,clearTimeout}
  const manager=new Hero68DeviceManager()
  try{
    await manager.connect(false)
    assert.equal(manager.getSnapshot().detectedModel,'hero68')
    assert.equal(manager.getSnapshot().detectedModelFromUuid,true)
    assert.equal(await manager.detectConnectedModel(),'hero68')
  }finally{await manager.disconnect();globalThis.window=oldWindow;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator}
})
test('connect refuses a keyboard that reports no HERO68/HERO84 UUID',async()=>{
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldWindow=globalThis.window
  // A well-formed UUID reply that names neither model must not fall back to the
  // product name (here "HERO 84 HE") or to the remembered model.
  const device={opened:false,vendorId:0x372e,productId:0x103e,productName:'AULA HERO 84 HE',collections:[],async open(){this.opened=true},async close(){this.opened=false},addEventListener(_type,listener){this.listener=listener},removeEventListener(){},async sendReport(){const packet=buildReport({command:0x82,zone:1,data:[0,0,0,0,0,0]});this.listener({reportId:9,data:new DataView(packet.buffer,1,63)})}}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{hid:{async getDevices(){return [device]}}}})
  globalThis.window={setTimeout,clearTimeout}
  const manager=new Hero68DeviceManager()
  try{
    await assert.rejects(()=>manager.connect(false),/device UUID/)
    assert.equal(manager.connected,false)
  }finally{await manager.disconnect();globalThis.window=oldWindow;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator}
})
test('lost profile ACK succeeds only after active-slot readback confirms the requested slot',()=>withDevice(async({manager,setRespond,reply,sent})=>{
  setRespond(request=>{if(request.command===0x90)reply(0x90,[1])})
  const result=await manager.request(buildReport({command:0x10,data:[1]}),0x10,0,12)
  assert.equal(result.command,0x10);assert.deepEqual(sent.map(r=>r.command).slice(1),[0x10,0x90])
}))
test('wrong active slot retries selection and never hides a persistent timeout',()=>withDevice(async({manager,setRespond,reply,sent})=>{
  setRespond(request=>{if(request.command===0x90)reply(0x90,[0])})
  await assert.rejects(()=>manager.request(buildReport({command:0x10,data:[2]}),0x10,0,12),/timed out/)
  assert.deepEqual(sent.map(r=>r.command).slice(1),[0x10,0x90,0x10,0x90,0x10,0x90])
}))
test('ordinary writes are not retried when their ACK is missing',()=>withDevice(async({manager,sent})=>{
  await assert.rejects(()=>manager.request(buildReport({command:0x13,data:[0,1]}),0x13,0,12),/timed out/)
  // One UUID read from connect(), then the single un-retried write.
  assert.deepEqual(sent.map(r=>r.command),[0x82,0x13])
}))

test('Hall snapshot waiter ignores other positions, incomplete snapshots and wrong zones',()=>withDevice(async({manager,setRespond,reply})=>{
  const records=[0,30,0,100,0,123,0,56,0,50,0,124]
  setRespond(request=>{
    reply(0x98,records,0)
    reply(0x98,records.slice(0,6),1)
    reply(0x98,[0,31,...records.slice(2)],1)
    reply(0x98,records,1)
  })
  const report=await manager.request(buildReport({command:0x98,zone:1,data:[0,30,0,56]}),0x98,1,100,
    report=>report.data.length===12&&report.data[1]===30&&report.data[7]===56)
  assert.deepEqual([...report.data],records)
}))
