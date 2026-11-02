const frame = document.getElementById('frame')
const openButton = document.getElementById('open')
const startButton = document.getElementById('start')
const saveButton = document.getElementById('save')
const status = document.getElementById('status')

let recording = false
let ready = false
// Keeps the packet counter live while the volunteer works in the vendor app.
setInterval(render, 500)

// The vendor app runs in the iframe and publishes its tap on its own window.
function tap() {
  try {
    return frame.contentWindow?.__OH_TAP
  } catch {
    return undefined
  }
}

function render() {
  startButton.disabled = !ready || recording
  saveButton.disabled = !ready
  const state = tap()
  const count = state?.count?.() ?? 0
  status.toggleAttribute('data-warn', state?.status === 'failed')
  if (!ready) {
    if (state?.status !== 'failed') status.textContent = 'chưa mở app'
    return
  }
  status.textContent = state?.status === 'failed'
    ? `lỗi: ${state.detail}`
    : recording ? `đang ghi · ${count} gói` : count ? `đã dừng · ${count} gói` : 'sẵn sàng ghi'
}

openButton.addEventListener('click', () => {
  frame.classList.remove('hidden')
  openButton.disabled = true
  status.textContent = 'đang tải app hãng…'
})

frame.addEventListener('load', () => {
  const onTap = () => {
    const value = tap()
    if (value) ready = value.status !== 'failed'
    render()
  }
  frame.contentWindow?.addEventListener('oh-tap', onTap)
  onTap()
})

startButton.addEventListener('click', () => {
  tap()?.start?.()
  recording = true
  render()
})

saveButton.addEventListener('click', () => {
  recording = false
  tap()?.download?.()
  render()
})

