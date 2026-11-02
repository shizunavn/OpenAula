import fs from 'node:fs'
import vm from 'node:vm'

// Extracts the AULA_2829 (HERO 84 HE) WIN layer-0 key table from a copy of the
// official AULA web driver bundle and prints it as JSON (see
// tests/fixtures/hero84-official-layout.json and tests/hero84-official-layout.test.mjs).
//
//   node tools/extract-hero84-layout.mjs app-CPb3bToC.js out.json
//
// Writes the file directly because PowerShell would UTF-16 a `>` redirect.
//
// `pos` is the protocol key position, `keyCode` the remap value, `lightPos` the
// official per-key LED index. The literal is JavaScript (`!0`, bare keys), so it
// is evaluated in an empty context rather than parsed as JSON.
const text = fs.readFileSync(process.argv[2], 'utf8')
const start = text.indexOf('wbt=[') + 5
const end = text.indexOf('}],n_={model:bbt', start) + 1
if (start < 5 || end < start) throw new Error('AULA_2829 layout table not found in the bundle')
const layer = vm.runInNewContext(`[${text.slice(start, end)}]`)
  .find((entry) => entry.os_type === 'WIN' && entry.layer === 0)

const NAME_TO_KEY_ID = {
  Esc: 'Escape', PrtSc: 'PrintScreen', '`~': 'Backquote', '-_': 'Minus', '=+': 'Equal',
  Caps: 'CapsLock', ';:': 'Semicolon', "' \"": 'Quote', ',<': 'Comma', '.>': 'Period',
  '/?': 'Slash', '[{': 'BracketLeft', ']}': 'BracketRight', '\\ |': 'Backslash',
  L_Shift: 'ShiftLeft', R_Shift: 'ShiftRight', L_Ctrl: 'ControlLeft', R_Ctrl: 'ControlRight',
  L_WIN: 'MetaLeft', L_Alt: 'AltLeft', R_Alt: 'AltRight', Fn1: 'Fn', Space: 'Space',
  Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', Insert: 'Insert', Delete: 'Delete',
  Home: 'Home', End: 'End', PgUp: 'PageUp', PgDn: 'PageDown',
  Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown',
}
// The driver labels the ten digit keys "1".."0"; their `pos` tells them apart.
const POS_TO_KEY_ID = new Map([[15, 'Digit1'], [16, 'Digit2'], [17, 'Digit3'], [18, 'Digit4'],
  [19, 'Digit5'], [20, 'Digit6'], [21, 'Digit7'], [22, 'Digit8'], [23, 'Digit9'], [24, 'Digit0']])

const rows = layer.keyboard.map((row) => row.map((key) => ({
  id: NAME_TO_KEY_ID[key.name]
    ?? POS_TO_KEY_ID.get(Number(key.pos))
    ?? (/^F\d+$/.test(key.name) ? key.name : `Key${key.name}`),
  name: key.name,
  pos: Number(key.pos),
  keyCode: Number.parseInt(key.value, 16),
  lightPos: Number(key.light_pos),
  effectPos: Number(key.effect_pos),
  x: Math.round(Number(key.x) * 10) / 10,
  width: Math.round(Number(key.width) * 10) / 10,
})))
if (!process.argv[3]) throw new Error('usage: extract-hero84-layout.mjs <driver bundle> <out.json>')
fs.writeFileSync(process.argv[3], JSON.stringify(rows, null, 2) + '\n')
