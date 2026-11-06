/**
 * AULA WIN 68 HE MAX (v1.1.4) — 100% Bit-Accurate Firmware RGB Effect Engine
 * Decompiled 1:1 from RISC-V RV32IMC + QingKe V4 XW Firmware (Flash Base 0x00004000)
 *
 * Includes:
 * - Exact ROM tables (`EXT_TO_INT_ROM` @ 0x1D2A0, `SPEED_ROM_TABLE` @ 0x1DA34,
 *   `BRIGHT_ROM_TABLE` @ 0x1D2BC, `SIN_ROM_181` @ 0x1CAC8, `ATAN2_ROM_42x42` @ 0x1CB80)
 * - 64-bit Knuth MMIX LCG PRNG (`VA 0x1B1F6` / `0x1B24C`)
 * - 16-iteration bitwise integer square root `isqrt32` (`VA 0x113E6`) & `hypot256` (`VA 0x11412`)
 * - Exact integer `rgbToHsv` (`VA 0x1142C`) & `hsvToRgb` (`VA 0x114C6`, divisor 15360)
 * - All 28 Internal Modes (`0..27`) & 27 External Modes (`0..26`)
 * - `XsydFirmwareRgbPreview` adapter compatible with `FirmwareRgbPreview`
 */

import type { RgbColor, RgbProfile } from '../protocol/hero68/rgb'
import { XSYD_KEYS } from '../protocol/xsyd/keymap'
import {
  normalizeXsydBrightness,
  XSYD_COLOR_SLOTS,
  XSYD_MAX_BRIGHTNESS,
  XSYD_PER_KEY_RGB_MODE,
  xsydColorIndexForZone,
} from '../protocol/xsyd/rgb'
import type { LightingFrame } from './lightingPreviewBus'
import { FirmwareRgbPreview } from './rgbPreview'

// VA 0x1D2A0 (27 bytes): External Mode ID (0..26) -> Internal Mode ID (1..27)
export const EXT_TO_INT_ROM: readonly number[] = [
  7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 1, 2, 3, 4, 5, 6,
]

// VA 0x1DA34 (-2004(gp)): 5 Speed levels (0..4)
export const SPEED_ROM_TABLE: readonly number[] = [0, 37, 53, 79, 143]

// VA 0x1D2BC: 6 Brightness levels (0..5)
export const BRIGHT_ROM_TABLE: readonly number[] = [15, 25, 35, 50, 65, 80]

// VA 0x1CAC8 (181 bytes): Quarter-wave Sine Lookup Table (0..180 half-degrees = 0..90 deg)
export const SIN_ROM_181: readonly number[] = [
  0, 2, 4, 6, 8, 11, 13, 15, 17, 20, 22, 24, 26, 28, 31, 33, 35, 37, 39, 42, 44, 46, 48, 50, 53, 55,
  57, 59, 61, 63, 65, 68, 70, 72, 74, 76, 78, 80, 83, 85, 87, 89, 91, 93, 95, 97, 99, 101, 103, 105,
  107, 109, 111, 113, 115, 117, 119, 121, 123, 125, 127, 129, 131, 133, 135, 137, 138, 140, 142, 144,
  146, 148, 149, 151, 153, 155, 156, 158, 160, 162, 163, 165, 167, 168, 170, 172, 173, 175, 177, 178,
  180, 181, 183, 184, 186, 188, 189, 190, 192, 193, 195, 196, 198, 199, 200, 202, 203, 204, 206, 207,
  208, 210, 211, 212, 213, 215, 216, 217, 218, 219, 220, 221, 223, 224, 225, 226, 227, 228, 229, 230,
  231, 232, 232, 233, 234, 235, 236, 237, 238, 238, 239, 240, 241, 241, 242, 243, 243, 244, 245, 245,
  246, 246, 247, 247, 248, 248, 249, 249, 250, 250, 251, 251, 251, 252, 252, 252, 253, 253, 253, 253,
  254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 255,
]

// VA 0x1CB80 (42 x 42 = 1,764 bytes): Polar Angle atan2(dy, dx) Lookup Table (0..180 half-degrees)
export const ATAN2_ROM_42x42: readonly (readonly number[])[] = [
  [0, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179, 179],
  [0, 89, 126, 143, 151, 157, 161, 163, 165, 167, 168, 169, 170, 171, 171, 172, 172, 173, 173, 173, 174, 174, 174, 175, 175, 175, 175, 175, 175, 176, 176, 176, 176, 176, 176, 176, 176, 176, 176, 177, 177, 177],
  [0, 53, 89, 112, 126, 136, 143, 148, 151, 154, 157, 159, 161, 162, 163, 164, 165, 166, 167, 167, 168, 169, 169, 170, 170, 170, 171, 171, 171, 172, 172, 172, 172, 173, 173, 173, 173, 173, 173, 174, 174, 174],
  [0, 36, 67, 89, 106, 118, 126, 133, 138, 143, 146, 149, 151, 154, 155, 157, 158, 159, 161, 162, 162, 163, 164, 165, 165, 166, 166, 167, 167, 168, 168, 168, 169, 169, 169, 170, 170, 170, 170, 171, 171, 171],
  [0, 28, 53, 73, 89, 102, 112, 120, 126, 132, 136, 140, 143, 145, 148, 150, 151, 153, 154, 156, 157, 158, 159, 160, 161, 161, 162, 163, 163, 164, 164, 165, 165, 166, 166, 166, 167, 167, 167, 168, 168, 168],
  [0, 22, 43, 61, 77, 89, 100, 108, 115, 121, 126, 131, 134, 137, 140, 143, 145, 147, 148, 150, 151, 153, 154, 155, 156, 157, 158, 159, 159, 160, 161, 161, 162, 162, 163, 163, 164, 164, 165, 165, 165, 166],
  [0, 18, 36, 53, 67, 79, 89, 98, 106, 112, 118, 122, 126, 130, 133, 136, 138, 141, 143, 144, 146, 148, 149, 150, 151, 153, 154, 154, 155, 156, 157, 158, 158, 159, 159, 160, 161, 161, 162, 162, 162, 163],
  [0, 16, 31, 46, 59, 71, 81, 89, 97, 104, 110, 115, 119, 123, 126, 129, 132, 135, 137, 139, 141, 143, 144, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 156, 157, 157, 158, 159, 159, 160, 160],
  [0, 14, 28, 41, 53, 64, 73, 82, 89, 96, 102, 107, 112, 116, 120, 123, 126, 129, 132, 134, 136, 138, 140, 141, 143, 144, 145, 146, 148, 149, 150, 151, 151, 152, 153, 154, 154, 155, 156, 156, 157, 157],
  [0, 12, 25, 36, 47, 58, 67, 75, 83, 89, 96, 101, 106, 110, 114, 118, 121, 124, 126, 129, 131, 133, 135, 137, 138, 140, 141, 143, 144, 145, 146, 147, 148, 149, 150, 151, 151, 152, 153, 154, 154, 155],
  [0, 11, 22, 33, 43, 53, 61, 69, 77, 83, 89, 95, 100, 104, 108, 112, 115, 119, 121, 124, 126, 129, 131, 133, 134, 136, 137, 139, 140, 141, 143, 144, 145, 146, 147, 148, 148, 149, 150, 151, 151, 152],
  [0, 10, 20, 30, 39, 48, 57, 64, 72, 78, 84, 89, 94, 99, 103, 107, 110, 114, 117, 119, 122, 124, 126, 128, 130, 132, 134, 135, 137, 138, 139, 140, 142, 143, 144, 145, 146, 146, 147, 148, 149, 149],
  [0, 9, 18, 28, 36, 45, 53, 60, 67, 73, 79, 85, 89, 94, 98, 102, 106, 109, 112, 115, 118, 120, 122, 124, 126, 128, 130, 132, 133, 135, 136, 137, 138, 140, 141, 142, 143, 144, 144, 145, 146, 147],
  [0, 8, 17, 25, 34, 42, 49, 56, 63, 69, 75, 80, 85, 89, 94, 98, 101, 105, 108, 111, 113, 116, 118, 121, 123, 125, 126, 128, 130, 131, 133, 134, 135, 136, 138, 139, 140, 141, 142, 143, 143, 144],
  [0, 8, 16, 24, 31, 39, 46, 53, 59, 65, 71, 76, 81, 85, 89, 93, 97, 101, 104, 107, 110, 112, 115, 117, 119, 121, 123, 125, 126, 128, 129, 131, 132, 134, 135, 136, 137, 138, 139, 140, 141, 142],
  [0, 7, 15, 22, 29, 36, 43, 50, 56, 61, 67, 72, 77, 81, 86, 89, 93, 97, 100, 103, 106, 108, 111, 113, 115, 118, 120, 121, 123, 125, 126, 128, 129, 131, 132, 133, 134, 135, 136, 137, 138, 139],
  [0, 7, 14, 21, 28, 34, 41, 47, 53, 58, 64, 69, 73, 78, 82, 86, 89, 93, 96, 99, 102, 105, 107, 110, 112, 114, 116, 118, 120, 122, 123, 125, 126, 128, 129, 130, 132, 133, 134, 135, 136, 137],
  [0, 6, 13, 20, 26, 32, 38, 44, 50, 55, 60, 65, 70, 74, 78, 82, 86, 89, 93, 96, 99, 102, 104, 107, 109, 111, 113, 115, 117, 119, 120, 122, 124, 125, 126, 128, 129, 130, 131, 132, 133, 134],
  [0, 6, 12, 18, 25, 31, 36, 42, 47, 53, 58, 62, 67, 71, 75, 79, 83, 86, 89, 93, 96, 98, 101, 103, 106, 108, 110, 112, 114, 116, 118, 119, 121, 122, 124, 125, 126, 128, 129, 130, 131, 132],
  [0, 6, 12, 17, 23, 29, 35, 40, 45, 50, 55, 60, 64, 68, 72, 76, 80, 83, 86, 89, 92, 95, 98, 100, 103, 105, 107, 109, 111, 113, 115, 116, 118, 120, 121, 123, 124, 125, 126, 128, 129, 130],
  [0, 5, 11, 17, 22, 28, 33, 38, 43, 48, 53, 57, 61, 66, 69, 73, 77, 80, 83, 87, 89, 92, 95, 97, 100, 102, 104, 106, 108, 110, 112, 114, 115, 117, 119, 120, 121, 123, 124, 125, 126, 127],
  [0, 5, 10, 16, 21, 26, 31, 36, 41, 46, 50, 55, 59, 63, 67, 71, 74, 77, 81, 84, 87, 89, 92, 95, 97, 99, 102, 104, 106, 108, 110, 111, 113, 115, 116, 118, 119, 120, 122, 123, 124, 125],
  [0, 5, 10, 15, 20, 25, 30, 35, 39, 44, 48, 53, 57, 61, 64, 68, 72, 75, 78, 81, 84, 87, 89, 92, 94, 97, 99, 101, 103, 105, 107, 109, 110, 112, 114, 115, 117, 118, 119, 121, 122, 123],
  [0, 4, 9, 14, 19, 24, 29, 33, 38, 42, 46, 51, 55, 58, 62, 66, 69, 72, 76, 79, 82, 84, 87, 89, 92, 94, 97, 99, 101, 103, 105, 106, 108, 110, 111, 113, 114, 116, 117, 118, 120, 121],
  [0, 4, 9, 14, 18, 23, 28, 32, 36, 41, 45, 49, 53, 56, 60, 64, 67, 70, 73, 76, 79, 82, 85, 87, 89, 92, 94, 96, 98, 100, 102, 104, 106, 107, 109, 111, 112, 114, 115, 116, 118, 119],
  [0, 4, 9, 13, 18, 22, 26, 31, 35, 39, 43, 47, 51, 54, 58, 61, 65, 68, 71, 74, 77, 80, 82, 85, 87, 89, 92, 94, 96, 98, 100, 102, 104, 105, 107, 108, 110, 111, 113, 114, 115, 117],
  [0, 4, 8, 13, 17, 21, 25, 30, 34, 38, 42, 45, 49, 53, 56, 59, 63, 66, 69, 72, 75, 77, 80, 82, 85, 87, 89, 92, 94, 96, 98, 100, 101, 103, 105, 106, 108, 109, 111, 112, 113, 115],
  [0, 4, 8, 12, 16, 20, 25, 29, 33, 36, 40, 44, 47, 51, 54, 58, 61, 64, 67, 70, 73, 75, 78, 80, 83, 85, 87, 89, 92, 94, 96, 97, 99, 101, 103, 104, 106, 107, 109, 110, 111, 113],
  [0, 4, 8, 12, 16, 20, 24, 28, 31, 35, 39, 42, 46, 49, 53, 56, 59, 62, 65, 68, 71, 73, 76, 78, 81, 83, 85, 87, 89, 92, 93, 95, 97, 99, 101, 102, 104, 105, 107, 108, 110, 111],
  [0, 3, 7, 11, 15, 19, 23, 27, 30, 34, 38, 41, 44, 48, 51, 54, 57, 60, 63, 66, 69, 71, 74, 76, 79, 81, 83, 85, 87, 89, 91, 93, 95, 97, 99, 100, 102, 103, 105, 106, 108, 109],
  [0, 3, 7, 11, 15, 18, 22, 26, 29, 33, 36, 40, 43, 46, 50, 53, 56, 59, 61, 64, 67, 69, 72, 74, 77, 79, 81, 83, 86, 88, 89, 91, 93, 95, 97, 98, 100, 101, 103, 104, 106, 107],
  [0, 3, 7, 11, 14, 18, 21, 25, 28, 32, 35, 39, 42, 45, 48, 51, 54, 57, 60, 63, 65, 68, 70, 73, 75, 77, 79, 82, 84, 86, 88, 89, 91, 93, 95, 96, 98, 100, 101, 103, 104, 105],
  [0, 3, 7, 10, 14, 17, 21, 24, 28, 31, 34, 37, 41, 44, 47, 50, 53, 55, 58, 61, 64, 66, 69, 71, 73, 75, 78, 80, 82, 84, 86, 88, 89, 91, 93, 95, 96, 98, 99, 101, 102, 104],
  [0, 3, 6, 10, 13, 17, 20, 23, 27, 30, 33, 36, 39, 43, 45, 48, 51, 54, 57, 59, 62, 64, 67, 69, 72, 74, 76, 78, 80, 82, 84, 86, 88, 89, 91, 93, 94, 96, 98, 99, 100, 102],
  [0, 3, 6, 10, 13, 16, 20, 23, 26, 29, 32, 35, 38, 41, 44, 47, 50, 53, 55, 58, 60, 63, 65, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 89, 91, 93, 94, 96, 97, 99, 100],
  [0, 3, 6, 9, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 49, 51, 54, 56, 59, 61, 64, 66, 68, 71, 73, 75, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 94, 96, 97, 99],
  [0, 3, 6, 9, 12, 15, 18, 22, 25, 28, 31, 33, 36, 39, 42, 45, 47, 50, 53, 55, 58, 60, 62, 65, 67, 69, 71, 73, 75, 77, 79, 81, 83, 85, 86, 88, 89, 91, 93, 94, 96, 97],
  [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 35, 38, 41, 44, 46, 49, 51, 54, 56, 59, 61, 63, 65, 68, 70, 72, 74, 76, 78, 79, 81, 83, 85, 86, 88, 89, 91, 93, 94, 95],
  [0, 3, 6, 9, 12, 14, 17, 20, 23, 26, 29, 32, 35, 37, 40, 43, 45, 48, 50, 53, 55, 57, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 81, 83, 85, 86, 88, 89, 91, 92, 94],
  [0, 2, 5, 8, 11, 14, 17, 20, 23, 25, 28, 31, 34, 36, 39, 42, 44, 47, 49, 51, 54, 56, 58, 61, 63, 65, 67, 69, 71, 73, 75, 76, 78, 80, 82, 83, 85, 86, 88, 89, 91, 92],
  [0, 2, 5, 8, 11, 14, 17, 19, 22, 25, 28, 30, 33, 36, 38, 41, 43, 46, 48, 50, 53, 55, 57, 59, 61, 64, 66, 68, 69, 71, 73, 75, 77, 79, 80, 82, 83, 85, 87, 88, 89, 91],
  [0, 2, 5, 8, 11, 13, 16, 19, 22, 24, 27, 30, 32, 35, 37, 40, 42, 45, 47, 49, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 75, 77, 79, 80, 82, 84, 85, 87, 88, 89],
]

// VA 0x043E0 / 0x0FBC8: Default 7-Color Palette (RGB1..RGB7)
export const DEFAULT_PALETTE_7: readonly number[] = [
  0xff0000, // RGB1: Red
  0x00ff00, // RGB2: Green
  0x7f7f00, // RGB3: Yellow
  0x0000ff, // RGB4: Blue
  0x7f007f, // RGB5: Purple
  0x007f7f, // RGB6: Cyan
  0x7f7f7f, // RGB7: White
]

// 8-direction neighbors for Mode 25 (Reactive 3x3 Cross Starburst, VA 0x1CA8C)
const NEIGHBORS_8: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]

export interface HsvColor {
  h: number // uint32_t (0..359)
  s: number // uint8_t  (0..255)
  v: number // uint8_t  (0..255)
}

export interface Win68KeyMatrixCell {
  keyId: string
  linearIdx: number
  row: number
  col: number
  ledIdx: number
  usage: number
}

/**
 * 68 physical keys of AULA WIN 68 HE MAX mapped to their exact 21x6 matrix
 * coordinates (`linearIdx = row * 21 + col` from `XSYD_KEYS` @ VA 0x4A20).
 */
export const KEYS_68: readonly Win68KeyMatrixCell[] = XSYD_KEYS.map((entry, ledIdx) => {
  const keyId = entry.code === 'F1' ? 'Fn' : entry.code
  const row = Math.trunc(entry.index / 21)
  const col = entry.index % 21
  return {
    keyId,
    linearIdx: entry.index,
    row,
    col,
    ledIdx,
    usage: entry.usage & 0xff,
  }
})

export const WIN68_CELL_BY_KEY_ID: ReadonlyMap<string, Win68KeyMatrixCell> = new Map(
  KEYS_68.map(cell => [cell.keyId, cell])
)

/** Map External Mode ID (`0..26`) to Internal Mode ID (`0..27`) via ROM `0x1D2A0`. */
export function externalToInternalMode(extMode: number, brightness = 4): number {
  if (brightness <= 0) {
    return 0
  }
  const normalized = extMode >= 200 && extMode < 300 ? extMode - 200 : extMode
  if (normalized >= 0 && normalized < EXT_TO_INT_ROM.length) {
    return EXT_TO_INT_ROM[normalized]
  }
  return 7
}

export class AulaWin68ExactRgbEngine {
  public readonly W = 21
  public readonly H = 6

  // SRAM Buffers
  public readonly rgbFb = new Uint32Array(127) // 0x200020F8
  public readonly blendFb = new Uint32Array(127) // 0x20002398
  public readonly blendWeights = new Uint8Array(127) // 0x20002590
  public readonly userRgb = new Uint32Array(127) // 0x20001EF8
  public readonly keyTrigger = new Uint8Array(126) // 0x20006AC6 (live Hall trigger state)
  public readonly prevKeyTrig = new Uint8Array(126) // 0x20001D00 (state + 64)

  // NVRAM Config Registers (0x20003198)
  public internalMode = 8 // 0..27 (0x200031C2)
  public speedIdx = 3 // 0..4  (0x200031C3)
  public brightIdx = 4 // 0..5  (0x200031C4)
  public bitmap = 1 // 0x200031C0 (bit 0 = enable, bit 1 = reverse direction)
  public colorIdx = 7 // 0..7  (-1704(gp) / 0x200031C6: 0..6 = Single, 7 = Rainbow)
  public backColor = 0x000000
  public palette: number[] = Array.from(DEFAULT_PALETTE_7)
  public adColorR = 100 // 0x200031EC
  public adColorG = 100 // 0x200031ED
  public adColorB = 100 // 0x200031EE

  // Engine State Header (0x20001CC0)
  public periodDiv = 60 // 0(state)
  public baseStep = 50 // 4(state) uint16_t
  public paramStep = 20 // 6(state) uint8_t
  public phase = 0 // 8(state) int32_t
  public subPhase = 1000 // 12(state) int32_t
  public floatTheta = 0.0 // 8..15(state) double in Mode 12

  // 64-bit Knuth MMIX LCG State (VA 0x1B1F6 / 0x1B24C)
  private prngState64: bigint = 1n

  // Mode-Specific Scratch State (0x20001D00 = state + 64)
  private starPacked = new Uint32Array(126)
  private rainIntensity = new Uint16Array(126)
  private rainDecay = new Uint16Array(126)
  private rainHue = new Uint16Array(126)
  private meteors: Array<{ yFp8: number; color: number; col: number; speedFp8: number }> = []
  private orb = { vx: 60, vy: 80, ax: 0, ay: 90, rIn: 2, rOut: 10, hue: 0 }
  private ribbon = { dirFlag: 1, amp: 256, freq: 1024, cA: 0xff0000, cB: 0x00ffff }
  private wipe = { cA: 0xff0000, cB: 0x00ff00, lastParity: 0 }
  private iris = { c1: 0xff0000, c2: 0x00ff00, t1: 0x0000ff, t2: 0xffff00, progress: 0.0, subMode: 1 }
  private zoneHues: [number, number] = [0, 180]
  private reactiveColorRot = 0
  private reactiveSingleV = new Uint8Array(126)
  private reactiveSingleRgb = new Uint32Array(126)
  private crossSlots: Array<{ kx: number; ky: number; cIdx: number; v: number; active: boolean }> = []
  private laserSlots: Array<{ kx: number; ky: number; cIdx: number; radius: number; v: number; active: boolean }> = []
  private rippleSlots: Array<{ kx: number; ky: number; maxR: number; curR: number; cIdx: number; active: boolean }> = []

  constructor(seed = 1) {
    this.srand(seed)
    this.userRgb.fill(0xff000000)
    for (const cell of KEYS_68) {
      const pp = ((cell.row & 0x07) << 5) | (cell.col & 0x1f)
      this.userRgb[cell.ledIdx] = ((pp << 24) | 0xffffff) >>> 0
    }
    this.initInternalMode(this.internalMode)
  }

  // VA 0x1B1F6: srand(seed)
  public srand(seed: number): void {
    this.prngState64 = BigInt(seed >>> 0)
  }

  // VA 0x1B24C: rand() -> 31-bit integer using 64-bit LCG (0x5851F42D4C957F2D * state + 1)
  public rand31(): number {
    this.prngState64 = (this.prngState64 * 0x5851f42d4c957f2dn + 1n) & 0xffffffffffffffffn
    return Number((this.prngState64 >> 32n) & 0x7fffffffn)
  }

  // VA 0x0EDF4: rand16() -> uint16_t
  public rand16(): number {
    return this.rand31() & 0xffff
  }

  // VA 0x112B4 / 0x11316: Quarter-wave Sine Lookup in 0..720 half-degrees -> [-255..255]
  public sin720(halfDeg: number): number {
    let a = (halfDeg | 0) % 720
    if (a < 0) a += 720
    if (a <= 180) return SIN_ROM_181[a]
    if (a <= 360) return SIN_ROM_181[360 - a]
    if (a <= 540) return -SIN_ROM_181[a - 360]
    return -SIN_ROM_181[720 - a]
  }

  // VA 0x0EEC8: Cosine in 0..720 half-degrees -> [-255..255]
  public cos720(halfDeg: number): number {
    const shifted = ((halfDeg + 180) << 16) >> 16
    return this.sin720(shifted)
  }

  // VA 0x11368: Exact ROM Table atan2(dy, dx) in 0..720 half-degrees
  public atan2_720(dx: number, dy: number): number {
    if (((dx + 41) & 0xff) > 82 || ((dy + 41) & 0xff) > 82) return 0
    if (dx >= 0) {
      if (dy >= 0) return ATAN2_ROM_42x42[dx][dy]
      return 720 - ATAN2_ROM_42x42[dx][-dy]
    } else {
      if (dy >= 0) return 360 - ATAN2_ROM_42x42[-dx][dy]
      return 360 + ATAN2_ROM_42x42[-dx][-dy]
    }
  }

  // VA 0x113E6: 16-iteration Bitwise Integer Square Root
  public isqrt32(val: number): number {
    let a0 = val >>> 0
    let a4 = 0
    let a5 = 0
    for (let i = 0; i < 16; i++) {
      const a3_top = a0 >>> 30
      a5 = ((a5 << 2) + a3_top) >>> 0
      const cand = ((a4 << 2) + 1) >>> 0
      a0 = (a0 << 2) >>> 0
      a4 = (a4 << 1) >>> 0
      if (a5 >= cand) {
        a5 = (a5 - cand) >>> 0
        a4 = (a4 + 1) >>> 0
      }
    }
    return a4 & 0xffff
  }

  // VA 0x11412: Euclidean Hypotenuse hypot256(dx, dy)
  public hypot256(dx: number, dy: number): number {
    const x = (dx << 8) | 0
    const y = (dy << 8) | 0
    const sumSq = (Math.imul(x, x) + Math.imul(y, y)) >>> 0
    return this.isqrt32(sumSq)
  }

  // VA 0x1142C: Exact Integer RGB_to_HSV
  public rgbToHsv(rgb: number): HsvColor {
    const r = (rgb >>> 16) & 0xff
    const g = (rgb >>> 8) & 0xff
    const b = rgb & 0xff
    const rgMax = g >= r ? g : r
    const max = rgMax >= b ? rgMax : b
    const rgMin = r >= g ? g : r
    const min = b >= rgMin ? rgMin : b
    const delta = max - min
    if (delta === 0) return { h: 0, s: 0, v: max }
    let h: number
    if (max === r) {
      h = Math.trunc((60 * (g - b)) / delta)
    } else if (max === g) {
      h = Math.trunc((60 * (b - r)) / delta) + 120
    } else {
      h = Math.trunc((60 * (r - g)) / delta) + 240
    }
    if (h < 0) h += 360
    const s = Math.trunc(((delta << 8) - 8) / max) & 0xff
    return { h: h % 360, s, v: max }
  }

  // VA 0x114C6: Exact Integer HSV_to_RGB (divisor 15360 = 60 * 256)
  public hsvToRgb(h: number, s: number, v: number): number {
    s &= 0xff
    v &= 0xff
    if (s === 0) return (0xff000000 | (v << 16) | (v << 8) | v) >>> 0
    const hMod = ((h % 360) + 360) % 360
    const region = Math.trunc(hMod / 60)
    const p = (((v << 8) - s * v) >> 8) & 0xff
    const prod = hMod * s * v
    const vScaled = v * 15360
    let r = 0
    let g = 0
    let b = 0
    if ((region & 1) !== 0) {
      const q = Math.trunc((vScaled - prod + s * v * region * 60) / 15360) & 0xff
      if (region === 1) {
        r = q
        g = v
        b = p
      } else if (region === 3) {
        r = p
        g = q
        b = v
      } else if (region === 5) {
        r = v
        g = p
        b = q
      }
    } else {
      const t = Math.trunc((vScaled + prod - (region + 1) * s * v * 60) / 15360) & 0xff
      if (region === 0) {
        r = v
        g = t
        b = p
      } else if (region === 2) {
        r = p
        g = v
        b = t
      } else if (region === 4) {
        r = t
        g = p
        b = v
      }
    }
    return (0xff000000 | (r << 16) | (g << 8) | b) >>> 0
  }

  // VA 0x0FE0A: Single-Color Brightness Modulator
  public modulateSingleColor(rgb: number, hsv: HsvColor, vMod: number, vMin: number): number {
    if (rgb === 0) return 0
    const r = (rgb >>> 16) & 0xff
    const g = (rgb >>> 8) & 0xff
    const b = rgb & 0xff
    const v = Math.max(vMin & 0xff, Math.min(255, vMod & 0xff))
    if (r === g && g === b) {
      return this.hsvToRgb(hsv.h, 0, v)
    }
    return this.hsvToRgb(hsv.h, hsv.s, v)
  }

  // VA 0x0FDC8: Check Single Color vs Rainbow Mode
  public getActiveSingleColor(): { isSingle: boolean; rgb: number; hsv: HsvColor } {
    if (this.colorIdx >= 0 && this.colorIdx <= 6) {
      const rgb = this.palette[this.colorIdx] & 0xffffff
      return { isSingle: true, rgb, hsv: this.rgbToHsv(rgb) }
    }
    return { isSingle: false, rgb: 0, hsv: { h: 0, s: 255, v: 255 } }
  }

  // VA 0x0D8F2: Linear RGB Interpolation
  public lerpRgb(c1: number, c2: number, t01: number): number {
    const t = Math.min(1, Math.max(0, t01))
    const r1 = (c1 >>> 16) & 0xff
    const g1 = (c1 >>> 8) & 0xff
    const b1 = c1 & 0xff
    const r2 = (c2 >>> 16) & 0xff
    const g2 = (c2 >>> 8) & 0xff
    const b2 = c2 & 0xff
    const r = Math.round(r1 + (r2 - r1) * t) & 0xff
    const g = Math.round(g1 + (g2 - g1) * t) & 0xff
    const b = Math.round(b1 + (b2 - b1) * t) & 0xff
    return (0xff000000 | (r << 16) | (g << 8) | b) >>> 0
  }

  // VA 0x0F7A2: Fill Framebuffer (0x200020F8)
  public fillFb(rgb: number): void {
    this.rgbFb.fill(rgb >>> 0)
  }

  // VA 0x0F7B8: Set Pixel at (col, row)
  public setPixel(col: number, row: number, rgb: number): void {
    if (col >= 0 && col < 21 && row >= 0 && row < 6) {
      this.rgbFb[row * 21 + col] = rgb >>> 0
    }
  }

  // VA 0x0F880: Bresenham Line Rasterizer
  public drawLine(x0: number, y0: number, x1: number, y1: number, rgb: number): void {
    x0 |= 0
    y0 |= 0
    x1 |= 0
    y1 |= 0
    const dx = Math.abs(x1 - x0)
    const sx = x0 < x1 ? 1 : -1
    const dy = -Math.abs(y1 - y0)
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    while (true) {
      this.setPixel(x0, y0, rgb)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x0 += sx
      }
      if (e2 <= dx) {
        err += dx
        y0 += sy
      }
    }
  }

  // VA 0x0F93E: Manhattan Diamond Rasterizer around (cx, cy) with radius r
  public drawDiamond(cx: number, cy: number, r: number, rgb: number): void {
    if (r <= 0) {
      this.setPixel(cx, cy, rgb)
      return
    }
    this.drawLine(cx - r, cy, cx, cy - r, rgb)
    this.drawLine(cx, cy - r, cx + r, cy, rgb)
    this.drawLine(cx + r, cy, cx, cy + r, rgb)
    this.drawLine(cx, cy + r, cx - r, cy, rgb)
  }

  // VA 0x0F9EE: Weighted Additive Blend into 0x20002398 & 0x20002590
  public blendPixel(col: number, row: number, rgb: number, weight: number): void {
    if (col < 0 || col >= 21 || row < 0 || row >= 6) return
    const idx = row * 21 + col
    const w = Math.min(255, Math.max(0, weight | 0))
    const prevW = this.blendWeights[idx]
    if (prevW === 0) {
      this.blendFb[idx] = rgb >>> 0
      this.blendWeights[idx] = w
    } else {
      const prev = this.blendFb[idx]
      const tot = prevW + w
      const r = Math.trunc((((prev >>> 16) & 0xff) * prevW + ((rgb >>> 16) & 0xff) * w) / tot) & 0xff
      const g = Math.trunc((((prev >>> 8) & 0xff) * prevW + ((rgb >>> 8) & 0xff) * w) / tot) & 0xff
      const b = Math.trunc(((prev & 0xff) * prevW + (rgb & 0xff) * w) / tot) & 0xff
      this.blendFb[idx] = (0xff000000 | (r << 16) | (g << 8) | b) >>> 0
      this.blendWeights[idx] = Math.max(1, Math.trunc((Math.min(prevW, w) * 6) / 10))
    }
  }

  /** Frame period in milliseconds from `VA 0x0EE04`: `1000 / (periodDiv + 1)`. */
  public get tickPeriodMs(): number {
    return 1000 / (this.periodDiv + 1)
  }

  // VA 0x0ED5E + 0x1C994: Initialize Internal Mode (0..27)
  public initInternalMode(intMode: number): void {
    this.internalMode = intMode
    this.periodDiv = 60
    this.baseStep = 50
    this.paramStep = 20
    this.phase = 0
    this.subPhase = 1000
    this.floatTheta = 0.0
    this.fillFb(0)
    this.blendFb.fill(0)
    this.blendWeights.fill(0)
    this.prevKeyTrig.set(this.keyTrigger)

    switch (intMode) {
      case 0: // VA 0x0FC24: LED Off
        this.periodDiv = 100
        break
      case 11: // VA 0x0DE56: Polar Pinwheel Vortex
        this.baseStep = 80
        this.paramStep = 10
        break
      case 12: // VA 0x0EEEA: Rotating Compass 360
        this.baseStep = 10
        this.paramStep = 50
        break
      case 13: // VA 0x0EEDC: Symmetric Butterfly Wave
        this.baseStep = 50
        this.paramStep = 50
        break
      case 14: // VA 0x0DE10: Breathing & Radial Iris
        this.baseStep = 120
        this.paramStep = 30
        this.iris = {
          c1: this.hsvToRgb(this.rand16() % 360, 255, 255),
          c2: this.hsvToRgb((this.rand16() + 120) % 360, 255, 255),
          t1: this.hsvToRgb((this.rand16() + 60) % 360, 255, 255),
          t2: this.hsvToRgb((this.rand16() + 240) % 360, 255, 255),
          progress: 0.0,
          subMode: 1,
        }
        break
      case 15: // VA 0x0DBFE: 3-Zone Interleaved Sine
        this.baseStep = 30
        this.paramStep = 3
        this.zoneHues = [this.rand16() % 360, (this.rand16() + 150) % 360]
        break
      case 16: { // VA 0x0DE62: Dual-Color Sine Ribbon
        this.baseStep = 20
        this.paramStep = 30
        const cA = this.hsvToRgb(this.rand16() % 360, 255, 255) & 0xffffff
        const cB = (~cA) & 0xffffff
        this.ribbon = { dirFlag: 1, amp: 256, freq: 1024, cA, cB }
        break
      }
      case 17: // VA 0x0F482: Color Wipe Curtain
        this.baseStep = 10
        this.paramStep = 30
        this.wipe = {
          cA: this.hsvToRgb(this.rand16() % 360, 255, 255),
          cB: this.hsvToRgb((this.rand16() + 140) % 360, 255, 255),
          lastParity: 0,
        }
        break
      case 18:
      case 19: // VA 0x0DBE0: Dancing Sine Snake / Symmetric Dual Sine
        this.baseStep = 100
        this.paramStep = 45
        break
      case 20: // VA 0x0F2CA: Starry Sky Shimmer
        this.baseStep = 50
        this.paramStep = 30
        for (let i = 0; i < 126; i++) {
          const hue = this.rand16() % 360
          const rate = 255 + (this.rand16() & 0xff)
          this.starPacked[i] = ((rate << 22) | ((hue & 0x3fff) << 8)) >>> 0
        }
        break
      case 21: // VA 0x0F464: Twinkling Raindrops
        this.baseStep = 10
        this.paramStep = 30
        this.rainIntensity.fill(0)
        this.rainDecay.fill(160)
        for (let i = 0; i < 126; i++) {
          this.rainHue[i] = (i * 29 + this.rand16()) % 360
          if ((i % 7) === 0) {
            this.rainIntensity[i] = 0x8000 + ((this.rand16() & 0x7f) << 8)
          }
        }
        break
      case 22: // VA 0x0DDF2: Digital Matrix Rain
        this.periodDiv = 200
        this.baseStep = 30
        this.paramStep = 10
        this.meteors = []
        break
      case 23: // VA 0x0DB88: 2D Bouncing Spotlight Orb
        this.periodDiv = 16
        this.baseStep = 100
        this.paramStep = 30
        this.orb = {
          vx: 50 + (this.rand16() & 127),
          vy: 70 + (this.rand16() & 127),
          ax: 90 * 255,
          ay: 45 * 255,
          rIn: 2,
          rOut: 10,
          hue: this.rand16() % 360,
        }
        break
      case 24: // VA 0x1020A: Reactive Single Key
        this.reactiveSingleV.fill(0)
        this.reactiveSingleRgb.fill(0)
        break
      case 25: // VA 0x10366: Reactive 3x3 Starburst
        this.crossSlots = Array.from({ length: 7 }, () => ({ kx: 0, ky: 0, cIdx: 0, v: 0, active: false }))
        break
      case 26: // VA 0x105B8: Reactive Row Laser
        this.periodDiv = 100
        this.laserSlots = Array.from({ length: 7 }, () => ({ kx: 0, ky: 0, cIdx: 0, radius: 0, v: 0, active: false }))
        break
      case 27: // VA 0x1084A: Reactive Full Ripple
        this.periodDiv = 50
        this.rippleSlots = Array.from({ length: 7 }, () => ({ kx: 0, ky: 0, maxR: 26, curR: 0, cIdx: 0, active: false }))
        break
      default:
        break
    }
  }

  private collectNewlyPressedCells(): Array<{ idx: number; col: number; row: number }> {
    const pressed: Array<{ idx: number; col: number; row: number }> = []
    for (let idx = 0; idx < 126; idx++) {
      const cur = this.keyTrigger[idx]
      const prev = this.prevKeyTrig[idx]
      this.prevKeyTrig[idx] = cur
      if (cur !== 0 && prev === 0) {
        pressed.push({ idx, col: idx % 21, row: Math.trunc(idx / 21) })
      }
    }
    return pressed
  }

  // VA 0x0EE04 + 0x1C994: Execute 1 Firmware Tick Frame for All 28 Internal Modes (0..27)
  public stepTick(capsLock = false, winLock = false): void {
    const spd = SPEED_ROM_TABLE[this.speedIdx] ?? 53
    const dir = (this.bitmap & 0x02) !== 0 ? 1 : 0
    const single = this.getActiveSingleColor()

    switch (this.internalMode) {
      case 0: // VA 0x0FC24: LED Off
        this.fillFb(0)
        break

      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6: // VA 0x10D88..0x10DC4 -> VA 0x10D4A: Decode user_rgb (0x20001EF8) to rgb_fb (0x200020F8)
        this.fillFb(0)
        for (let i = 0; i < 126; i++) {
          const word = this.userRgb[i] >>> 0
          const pos = (word >>> 24) & 0xff
          if (pos !== 0xff) {
            const row = (pos >>> 5) & 0x07
            const col = pos & 0x1f
            const rgb = (0xff000000 | (word & 0x00ffffff)) >>> 0
            this.setPixel(col, row, rgb)
          }
        }
        break

      case 7: // VA 0x0FB46 (Ext 0): Static / Constant On
        if (single.isSingle) {
          this.fillFb((0xff000000 | single.rgb) >>> 0)
        } else {
          this.fillFb(this.backColor)
          for (let x = 0; x < 21; x++) {
            const c = this.hsvToRgb((x * 36) % 360, 255, 255)
            for (let y = 0; y < 6; y++) this.setPixel(x, y, c)
          }
        }
        break

      case 8: { // VA 0x0FE3E (Ext 1): Aurora Horizontal Sine Wave
        this.phase = (this.phase + spd + 10) % 1440
        const baseDeg = this.phase * 0.25
        const colStep = 360.0 / 21.0
        for (let x = 0; x < 21; x++) {
          let deg = dir ? baseDeg + x * colStep : baseDeg - x * colStep
          deg = ((deg % 360) + 360) % 360
          let rad = ((deg - 180.0) * Math.PI) / 180.0
          if (rad > Math.PI) rad -= 2 * Math.PI
          if (rad < -Math.PI) rad += 2 * Math.PI
          const s2 = rad * rad
          const val = Math.min(255, Math.trunc(((1.0 - s2 * 0.5 + (s2 * s2) / 24.0) * 0.5 + 0.5) * 180.0 + 40.0))
          const rgb = single.isSingle
            ? this.modulateSingleColor(single.rgb, single.hsv, val, 40)
            : this.hsvToRgb(Math.trunc(deg) % 360, 255, val)
          for (let y = 0; y < 6; y++) this.setPixel(x, y, rgb)
        }
        break
      }

      case 9: { // VA 0x1005A (Ext 2): Vertical Row Cascade Wave (Tide Flux)
        let nextPhase = (this.phase + spd) % 720
        if (nextPhase < spd) nextPhase = (nextPhase + 1) % 720
        this.phase = nextPhase
        let h = this.phase >> 1
        for (let y = 0; y < 6; y++) {
          const vMod = (this.sin720(h << 1) + 255) >> 1
          const rgb = single.isSingle
            ? this.modulateSingleColor(single.rgb, single.hsv, vMod, 40)
            : this.hsvToRgb(h, 255, 255)
          h = dir ? (h + 18 <= 359 ? h + 18 : h - 342) : h - 18 >= 0 ? h - 18 : h + 342
          for (let x = 0; x < 21; x++) this.setPixel(x, y, rgb)
        }
        break
      }

      case 10: { // VA 0x10128 (Ext 3): Center Diamond Ripple (Soft Ripple)
        const step = (spd + 3) & 0xff
        let nextPhase = (this.phase + step) % 1440
        if (nextPhase < step) nextPhase = (nextPhase + 1) % 1440
        this.phase = nextPhase
        let h = this.phase >> 2
        for (let r = 0; r < 32; r++) {
          const vMod = (this.sin720(h << 1) + 255) >> 1
          const rgb = single.isSingle
            ? this.modulateSingleColor(single.rgb, single.hsv, vMod, 40)
            : this.hsvToRgb(h, 255, 255)
          h = dir ? (h + 18 <= 359 ? h + 18 : h - 342) : h - 18 >= 0 ? h - 18 : h + 342
          this.drawDiamond(10, 2, r, rgb)
        }
        break
      }

      case 11: { // VA 0x0E332 (Ext 4): Polar Pinwheel Vortex (Snipping Storm)
        for (let x = 0; x < 21; x++) {
          const dx = 21 - (x << 1)
          for (let y = 0; y < 6; y++) {
            const dy = 6 - (y << 1)
            let ang = this.atan2_720(dx, dy)
            if (!dir) ang = -ang
            const dist = (this.hypot256(dx, dy) * this.paramStep) >> 7
            const rawH = Math.abs((ang >> 1) + dist - (this.subPhase >> 7)) % 360
            const qHue = Math.trunc(rawH / 30) * 30
            const tri =
              qHue <= 179
                ? 10 + Math.trunc((245 * qHue) / 180)
                : 255 - Math.trunc((245 * (qHue - 180)) / 180)
            const rgb = single.isSingle
              ? this.modulateSingleColor(single.rgb, single.hsv, tri, 15)
              : this.hsvToRgb(qHue, 255, tri)
            this.setPixel(x, y, rgb)
          }
        }
        this.subPhase = (this.subPhase + Math.trunc(((spd * 20 + this.baseStep) << 8) / this.periodDiv)) & 0xffffff
        break
      }

      case 12: { // VA 0x0EEF6 (Ext 5): Rotating Compass 360
        this.floatTheta = (this.floatTheta + (spd * 5 + this.baseStep) / (this.periodDiv * 10)) % 360.0
        let radHalf = Math.trunc((this.floatTheta / 180.0) * Math.PI * 255.0)
        if (!dir) radHalf = -radHalf
        const c = this.cos720(radHalf)
        const s = this.sin720(radHalf)
        for (let x = 0; x < 21; x++) {
          const dx = x - 10
          for (let y = 0; y < 6; y++) {
            const dy = y - 2
            const proj = Math.trunc(((dx * s + dy * c) * 720) / (255 * 64))
            const hue = ((Math.trunc(this.floatTheta) + 360 + proj) % 360 + 360) % 360
            const vMod = (this.sin720(hue << 1) + 255) >> 1
            const rgb = single.isSingle
              ? this.modulateSingleColor(single.rgb, single.hsv, vMod, 40)
              : this.hsvToRgb(hue, 255, 255)
            this.setPixel(x, y, rgb)
          }
        }
        break
      }

      case 13: { // VA 0x0F09C (Ext 6): Symmetric Butterfly Wave
        const step = Math.trunc(((spd * 10 + this.baseStep) << 6) / this.periodDiv)
        this.phase = (this.phase + (dir ? step : -step)) & 0xffffff
        this.subPhase = (this.subPhase + Math.max(1, spd >> 3)) % 360
        const ang = (this.phase >> 6) % 720
        const c = this.cos720(ang)
        const s = this.sin720(ang)
        for (let x = 0; x < 21; x++) {
          const symX = (Math.abs(x - 10) + 56) * 5
          for (let y = 0; y < 6; y++) {
            const symY = (y - 2) * 5
            const rot = Math.trunc((symX * c - symY * s) / 255)
            const hue = ((rot + this.subPhase) % 360 + 360) % 360
            const vMod = (this.sin720(hue << 1) + 255) >> 1
            const rgb = single.isSingle
              ? this.modulateSingleColor(single.rgb, single.hsv, vMod, 40)
              : this.hsvToRgb(hue, 255, 255)
            this.setPixel(x, y, rgb)
          }
        }
        break
      }

      case 14: { // VA 0x0E47E (Ext 7): Breathing & Radial Iris
        this.phase = (this.phase + Math.max(2, Math.trunc((spd + this.baseStep) / 8))) % 720
        if (single.isSingle) {
          const vMod = (this.sin720(this.phase) + 255) >> 1
          const rgb = this.modulateSingleColor(single.rgb, single.hsv, vMod, 15)
          this.fillFb(rgb)
        } else {
          this.iris.progress += (spd + 25) / 2400.0
          if (this.iris.progress >= 1.0) {
            this.iris.progress = 0.0
            this.iris.subMode ^= 1
            this.iris.c1 = this.iris.t1
            this.iris.c2 = this.iris.t2
            this.iris.t1 = this.hsvToRgb(this.rand16() % 360, 255, 255)
            this.iris.t2 = this.hsvToRgb((this.rand16() + 150) % 360, 255, 255)
          }
          for (let x = 0; x < 21; x++) {
            for (let y = 0; y < 6; y++) {
              const d = this.hypot256(x - 10, y - 2) / (12 * 256)
              const t = this.iris.subMode ? Math.min(1, Math.max(0, this.iris.progress * 1.4 - d * 0.4)) : this.iris.progress
              const colA = this.lerpRgb(this.iris.c1, this.iris.t1, t)
              const colB = this.lerpRgb(this.iris.c2, this.iris.t2, t)
              this.setPixel(x, y, this.lerpRgb(colA, colB, Math.min(1, d)))
            }
          }
        }
        break
      }

      case 15: { // VA 0x0DC38 (Ext 8): 3-Zone Interleaved Sine
        this.phase = (this.phase + Math.max(2, Math.trunc((spd + this.baseStep) / 4))) % 720
        if (this.phase < 8) {
          this.zoneHues = [(this.zoneHues[0] + 23) % 360, (this.zoneHues[1] + 47) % 360]
        }
        const cA = this.hsvToRgb((this.zoneHues[0] + (this.phase >> 2)) % 360, 255, 255)
        const cB = this.hsvToRgb((this.zoneHues[1] + (this.phase >> 2)) % 360, 255, 255)
        for (let x = 0; x < 21; x++) {
          const zone = Math.trunc(x / 7)
          const inv = ((zone & 1) ^ dir) !== 0
          for (let y = 0; y < 6; y++) {
            const ang = (inv ? -this.phase : this.phase) + y * 60 + (x % 7) * 30
            const t = (this.sin720(ang) + 255) / 510.0
            const rgb = single.isSingle
              ? this.modulateSingleColor(single.rgb, single.hsv, Math.round(t * 255), 35)
              : this.lerpRgb(cA, cB, t)
            this.setPixel(x, y, rgb)
          }
        }
        break
      }

      case 16: { // VA 0x0DEA8 (Ext 9): Dual-Color Sine Ribbon
        const delta = Math.max(2, Math.trunc((spd + this.baseStep) / 6))
        this.ribbon.amp += this.ribbon.dirFlag * delta
        if (this.ribbon.amp >= 256) {
          this.ribbon.amp = 256
          this.ribbon.dirFlag = -1
        } else if (this.ribbon.amp <= -256) {
          this.ribbon.amp = -256
          this.ribbon.dirFlag = 1
          const cA = this.hsvToRgb(this.rand16() % 360, 255, 255) & 0xffffff
          this.ribbon.cA = cA
          this.ribbon.cB = (~cA) & 0xffffff
        }
        this.phase = (this.phase + (dir ? delta : -delta)) % 720
        for (let x = 0; x < 21; x++) {
          const s = (this.sin720(this.phase + x * 34) * this.ribbon.amp) >> 8
          const t = (s + 255) / 510.0
          for (let y = 0; y < 6; y++) {
            const rowBias = (y - 2.5) * 0.08
            const rgb = single.isSingle
              ? this.modulateSingleColor(single.rgb, single.hsv, Math.round(Math.min(1, Math.max(0, t + rowBias)) * 255), 35)
              : this.lerpRgb(this.ribbon.cA, this.ribbon.cB, t + rowBias)
            this.setPixel(x, y, rgb)
          }
        }
        break
      }

      case 17: { // VA 0x0F4A4 (Ext 10): Color Wipe Curtain
        this.subPhase = (this.subPhase + Math.max(2, Math.trunc((spd + this.baseStep) / 5))) & 0xffff
        const parity = (this.subPhase >> 8) & 1
        if (parity !== this.wipe.lastParity) {
          this.wipe.lastParity = parity
          this.wipe.cA = this.wipe.cB
          this.wipe.cB = this.hsvToRgb((this.rand16() + 95) % 360, 255, 255)
        }
        const pos = this.subPhase & 0xff
        const colThreshold = Math.trunc((pos * 21) / 256)
        for (let x = 0; x < 21; x++) {
          const effX = dir ? 20 - x : x
          const activeB = effX <= colThreshold
          let rgb: number
          if (single.isSingle) {
            rgb = this.modulateSingleColor(single.rgb, single.hsv, activeB ? 255 : 55, 40)
          } else {
            rgb = activeB ? this.lerpRgb(this.wipe.cB, this.wipe.cA, x / 24) : this.lerpRgb(this.wipe.cA, this.wipe.cB, x / 24)
          }
          for (let y = 0; y < 6; y++) this.setPixel(x, y, rgb)
        }
        break
      }

      case 18: { // VA 0x0E7EC (Ext 11): Dancing Sine Snake
        this.phase = (this.phase + spd * 12 + this.baseStep) & 0xffffff
        for (let x = 0; x < 21; x++) {
          const sx = dir ? -x : x
          const ySnake = ((this.sin720(sx * 45 + (this.phase >> 6)) + 255) / 510.0) * 6.0 * 0.9
          for (let y = 0; y < 6; y++) {
            const d = Math.min(1.0, Math.abs(ySnake - y) / 6.0)
            const v = Math.max(45, Math.trunc(Math.pow(1.0 - d, 2) * 255))
            const rgb = single.isSingle
              ? this.modulateSingleColor(single.rgb, single.hsv, v, 45)
              : this.hsvToRgb((Math.trunc(d * 360) + (this.phase >> 8)) % 360, 255, v)
            this.setPixel(x, y, rgb)
          }
        }
        break
      }

      case 19: { // VA 0x0E07A (Ext 12): Symmetric Dual Sine (Smooth Flow)
        this.phase = (this.phase + spd * 12 + this.baseStep) & 0xffffff
        for (let x = 0; x < 21; x++) {
          const distCenter = Math.abs(x - 10)
          const dx = dir ? distCenter : -distCenter
          const ySnake = ((this.sin720(dx * 45 + (this.phase >> 6)) + 255) / 510.0) * 6.0 * 0.9
          for (let y = 0; y < 6; y++) {
            const d = Math.min(1.0, Math.abs(ySnake - y) / 6.0)
            const v = Math.max(45, Math.trunc(Math.pow(1.0 - d, 2) * 255))
            const rgb = single.isSingle
              ? this.modulateSingleColor(single.rgb, single.hsv, v, 45)
              : this.hsvToRgb((Math.trunc(d * 360) + (this.phase >> 8) + distCenter * 14) % 360, 255, v)
            this.setPixel(x, y, rgb)
          }
        }
        break
      }

      case 20: { // VA 0x0F340 (Ext 13): Starry Sky Shimmer
        for (let i = 0; i < 126; i++) {
          const word = this.starPacked[i]
          const rate = (word >>> 22) & 0x3ff
          let hueFp = (word >>> 8) & 0x3fff
          const delta = Math.max(1, Math.trunc((rate * (this.baseStep + spd)) / (this.periodDiv * 16)))
          hueFp = (hueFp + delta) % (360 << 4)
          this.starPacked[i] = ((rate << 22) | (hueFp << 8)) >>> 0
          const hue = hueFp >> 4
          const vWave = 60 + (((this.sin720(hue << 1) + 255) * 195) >> 9)
          this.rgbFb[i] = single.isSingle
            ? this.modulateSingleColor(single.rgb, single.hsv, vWave, 35)
            : this.hsvToRgb(hue, 255, vWave)
        }
        break
      }

      case 21: { // VA 0x0F608 (Ext 14): Twinkling Raindrops
        const triggerThreshold = Math.max(1, Math.trunc(128 / this.paramStep))
        for (let i = 0; i < 126; i++) {
          let inten = this.rainIntensity[i]
          if (inten <= 255) {
            if ((this.rand16() & 0xff) < triggerThreshold) {
              inten = 0xffff
              this.rainDecay[i] = 128 + (this.rand16() & 127)
              this.rainHue[i] = this.rand16() % 360
            } else {
              inten = 0
            }
          } else {
            const drop = Math.trunc(((this.baseStep + spd * 3) * 4 * this.rainDecay[i]) / 80)
            inten = Math.max(0, inten - drop)
          }
          this.rainIntensity[i] = inten
          const v = inten >>> 8
          this.rgbFb[i] =
            v === 0
              ? this.backColor
              : single.isSingle
                ? this.modulateSingleColor(single.rgb, single.hsv, v, 0)
                : this.hsvToRgb(this.rainHue[i], 255, v)
        }
        break
      }

      case 22: { // VA 0x0E240 (Ext 15): Digital Matrix Rain
        this.fillFb(this.backColor)
        if (this.meteors.length < 10 && (this.rand16() & 0x03) === 0) {
          const col = this.rand16() % 21
          const c = single.isSingle
            ? single.rgb
            : this.hsvToRgb(this.rand16() % 360, 255, 255) & 0xffffff
          const speedFp8 = 48 + ((spd + 20) >> 1) + (this.rand16() & 31)
          this.meteors.push({ yFp8: 0, color: c, col, speedFp8 })
        }
        const hsvCache = new Map<number, HsvColor>()
        for (let m = this.meteors.length - 1; m >= 0; m--) {
          const drop = this.meteors[m]
          drop.yFp8 += drop.speedFp8
          const activeDropColor = single.isSingle ? single.rgb : drop.color
          let hsv = hsvCache.get(activeDropColor)
          if (!hsv) {
            hsv = this.rgbToHsv(activeDropColor)
            hsvCache.set(activeDropColor, hsv)
          }
          for (let y = 0; y < 6; y++) {
            const distRows = (drop.yFp8 - (y << 8)) >> 8
            if (distRows >= 0 && distRows <= 2) {
              const v = distRows === 0 ? 255 : distRows === 1 ? 150 : 65
              const effY = dir ? 5 - y : y
              this.setPixel(drop.col, effY, this.modulateSingleColor(activeDropColor, hsv, v, 20))
            }
          }
          if (drop.yFp8 > (6 + 3) << 8) {
            this.meteors.splice(m, 1)
          }
        }
        break
      }

      case 23: { // VA 0x0E9B6 (Ext 16): 2D Bouncing Spotlight Orb
        this.fillFb(this.backColor)
        const stepScale = Math.max(1, Math.trunc((spd + 30) / 3))
        this.orb.ax += Math.trunc((this.orb.vx * stepScale) / 16)
        this.orb.ay += Math.trunc((this.orb.vy * stepScale) / 16)
        const maxAng = 90 * 255
        if (this.orb.ax >= maxAng || this.orb.ax <= -maxAng) {
          this.orb.vx = (this.orb.ax >= maxAng ? -1 : 1) * (50 + (this.rand16() & 127))
          this.orb.ax = Math.max(-maxAng, Math.min(maxAng, this.orb.ax))
          this.orb.hue = (this.orb.hue + 55 + (this.rand16() % 90)) % 360
        }
        if (this.orb.ay >= maxAng || this.orb.ay <= -maxAng) {
          this.orb.vy = (this.orb.ay >= maxAng ? -1 : 1) * (70 + (this.rand16() & 127))
          this.orb.ay = Math.max(-maxAng, Math.min(maxAng, this.orb.ay))
        }
        const cx = ((this.sin720(Math.trunc((this.orb.ax * 2) / 255)) + 255) * 20) / 510.0
        const cy = ((this.sin720(Math.trunc((this.orb.ay * 2) / 255)) + 255) * 5) / 510.0
        for (let x = 0; x < 21; x++) {
          for (let y = 0; y < 6; y++) {
            const dist = Math.hypot(x - cx, y - cy)
            if (dist <= this.orb.rOut) {
              const t = dist <= this.orb.rIn ? 1.0 : Math.max(0, 1.0 - (dist - this.orb.rIn) / (this.orb.rOut - this.orb.rIn))
              const v = Math.round(t * t * 255)
              if (v > 10) {
                const rgb = single.isSingle
                  ? this.modulateSingleColor(single.rgb, single.hsv, v, 10)
                  : this.hsvToRgb((this.orb.hue + Math.trunc(dist * 18)) % 360, 255, v)
                this.setPixel(x, y, rgb)
              }
            }
          }
        }
        break
      }

      case 24: { // VA 0x1020A (Ext 17): Reactive Single Key Fade
        const newlyPressed = this.collectNewlyPressedCells()
        for (const p of newlyPressed) {
          this.reactiveColorRot = (this.reactiveColorRot + 1) % 7
          const c = single.isSingle ? single.rgb : this.palette[this.reactiveColorRot]
          this.reactiveSingleRgb[p.idx] = c
          this.reactiveSingleV[p.idx] = 255
        }
        const decay = Math.max(3, Math.trunc((spd + 25) / 6))
        for (let i = 0; i < 126; i++) {
          let v = this.reactiveSingleV[i]
          if (this.keyTrigger[i] !== 0 && v < 220) {
            v = 255
            if (!this.reactiveSingleRgb[i]) {
              this.reactiveSingleRgb[i] = single.isSingle ? single.rgb : this.palette[this.reactiveColorRot % 7]
            }
          } else if (v > 0) {
            v = v - decay < 37 ? 0 : v - decay
          }
          this.reactiveSingleV[i] = v
          if (v === 0) {
            this.rgbFb[i] = this.backColor
          } else {
            const baseRgb = single.isSingle ? single.rgb : (this.reactiveSingleRgb[i] || this.palette[(i + this.reactiveColorRot) % 7] || 0xff0000)
            this.rgbFb[i] = this.modulateSingleColor(baseRgb, this.rgbToHsv(baseRgb), v, 37)
          }
        }
        break
      }

      case 25: { // VA 0x10366 (Ext 18): Reactive 3x3 Cross Starburst
        this.fillFb(this.backColor)
        const newlyPressed = this.collectNewlyPressedCells()
        for (const p of newlyPressed) {
          this.reactiveColorRot = (this.reactiveColorRot + 1) % 7
          const slot = this.crossSlots.find(s => !s.active) ?? this.crossSlots[0]
          slot.kx = p.col
          slot.ky = p.row
          slot.cIdx = this.reactiveColorRot
          slot.v = 255
          slot.active = true
        }
        const decay = Math.max(2, Math.trunc((spd + 20) / 10))
        for (const slot of this.crossSlots) {
          if (!slot.active) continue
          const centerIdx = slot.ky * 21 + slot.kx
          if (centerIdx >= 0 && centerIdx < 126 && this.keyTrigger[centerIdx] !== 0) {
            slot.v = 255
          }
          const baseRgb = single.isSingle ? single.rgb : this.palette[slot.cIdx % 7]
          const hsv = this.rgbToHsv(baseRgb)
          const rgb = this.modulateSingleColor(baseRgb, hsv, slot.v, 25)
          for (const [dx, dy] of NEIGHBORS_8) {
            this.setPixel(slot.kx + dx, slot.ky + dy, rgb)
          }
          if (centerIdx < 0 || centerIdx >= 126 || this.keyTrigger[centerIdx] === 0) {
            slot.v -= decay
            if (slot.v < 25) {
              slot.v = 0
              slot.active = false
            }
          }
        }
        break
      }

      case 26: { // VA 0x105B8 (Ext 19): Reactive Row Laser Beam
        this.fillFb(this.backColor)
        const newlyPressed = this.collectNewlyPressedCells()
        for (const p of newlyPressed) {
          this.reactiveColorRot = (this.reactiveColorRot + 1) % 7
          const slot = this.laserSlots.find(s => !s.active) ?? this.laserSlots[0]
          slot.kx = p.col
          slot.ky = p.row
          slot.cIdx = this.reactiveColorRot
          slot.radius = 0
          slot.v = 255
          slot.active = true
        }
        const stepR = Math.max(0.12, (spd + 30) / 500.0)
        for (const slot of this.laserSlots) {
          if (!slot.active) continue
          const baseRgb = single.isSingle ? single.rgb : this.palette[slot.cIdx % 7]
          const hsv = this.rgbToHsv(baseRgb)
          const maxOffset = Math.ceil(slot.radius)
          for (let off = 0; off <= maxOffset; off++) {
            const distFromFront = Math.abs(slot.radius - off)
            if (distFromFront <= 3.5) {
              const v = Math.round(Math.max(0, 1.0 - distFromFront / 3.5) * slot.v)
              if (v >= 25) {
                const rgb = single.isSingle
                  ? this.modulateSingleColor(baseRgb, hsv, v, 25)
                  : this.hsvToRgb((hsv.h + off * 18) % 360, 255, v)
                this.setPixel(slot.kx + off, slot.ky, rgb)
                this.setPixel(slot.kx - off, slot.ky, rgb)
              }
            }
          }
          slot.radius += stepR
          if (slot.radius > 22) {
            slot.active = false
          }
        }
        break
      }

      case 27: { // VA 0x1084A (Ext 20): Reactive Full-Keyboard Diamond Ripple
        this.blendFb.fill(this.backColor)
        this.blendWeights.fill(0)
        const newlyPressed = this.collectNewlyPressedCells()
        for (const p of newlyPressed) {
          this.reactiveColorRot = (this.reactiveColorRot + 1) % 7
          const slot = this.rippleSlots.find(s => !s.active) ?? this.rippleSlots[0]
          slot.kx = p.col
          slot.ky = p.row
          slot.maxR = 26
          slot.curR = 0
          slot.cIdx = this.reactiveColorRot
          slot.active = true
        }
        const stepR = Math.max(0.3, (spd + 25) / 85.0)
        for (const slot of this.rippleSlots) {
          if (!slot.active) continue
          const baseRgb = single.isSingle ? single.rgb : this.palette[slot.cIdx % 7]
          const hsv = this.rgbToHsv(baseRgb)
          const rCenter = slot.curR
          for (let x = 0; x < 21; x++) {
            for (let y = 0; y < 6; y++) {
              const manhattan = Math.abs(x - slot.kx) + Math.abs(y - slot.ky)
              const diff = Math.abs(manhattan - rCenter)
              if (diff <= 2.5) {
                const weight = Math.round((1.0 - diff / 2.5) * 255)
                const rgb = single.isSingle
                  ? this.modulateSingleColor(baseRgb, hsv, weight, 20)
                  : this.hsvToRgb((hsv.h + manhattan * 14) % 360, 255, weight)
                this.blendPixel(x, y, rgb, weight)
              }
            }
          }
          slot.curR += stepR
          if (slot.curR > slot.maxR) {
            slot.active = false
          }
        }
        this.rgbFb.set(this.blendFb)
        break
      }

      default:
        break
    }

    // VA 0x1400A: Hardware Indicator Overlay (CapsLock = row 3 col 0, WinLock = row 5 col 1)
    if (capsLock) this.setPixel(0, 3, 0xffffffff)
    if (winLock) this.setPixel(1, 5, 0xffffffff)
  }

  // VA 0x10EF2 + 0x10F74 + 0x1108A: Pack 126 Matrix Pixels into WS2812 GRB DMA Buffer (0x20002BF8)
  public encodeWs2812Dma(): Uint32Array {
    const dmaBuf = new Uint32Array(68 * 24)
    const brightRom = this.brightIdx <= 0 ? 0 : (BRIGHT_ROM_TABLE[this.brightIdx] ?? 80)
    const bScale = brightRom / 80.0

    for (const k of KEYS_68) {
      if (k.ledIdx < 0 || k.ledIdx >= 68) continue
      const raw = this.rgbFb[k.linearIdx] >>> 0
      const r = Math.min(255, Math.trunc(((raw >>> 16) & 0xff) * bScale * (this.adColorR / 100.0)))
      const g = Math.min(255, Math.trunc(((raw >>> 8) & 0xff) * bScale * (this.adColorG / 100.0)))
      const b = Math.min(255, Math.trunc((raw & 0xff) * bScale * (this.adColorB / 100.0)))

      const baseWord = k.ledIdx * 24
      for (let bit = 0; bit < 8; bit++) {
        dmaBuf[baseWord + bit] = g & (0x80 >>> bit) ? 0xf8 : 0xc0
        dmaBuf[baseWord + 8 + bit] = r & (0x80 >>> bit) ? 0xf8 : 0xc0
        dmaBuf[baseWord + 16 + bit] = b & (0x80 >>> bit) ? 0xf8 : 0xc0
      }
    }
    return dmaBuf
  }
}

export const XSYD_RGB_TICK_MS = 0.5

/**
 * High-level Preview Engine for AULA WIN 68 HE MAX (`XSYD 0x5C` / `v1.1.4`)
 * that wraps `AulaWin68ExactRgbEngine` with the exact same simulation contract
 * as `FirmwareRgbPreview` (`ticks`, `configure`, `advance`, `event`, `frame`).
 */
export class XsydFirmwareRgbPreview {
  public readonly core: AulaWin68ExactRgbEngine
  public ticks = 0
  private lastTickMs = 0
  private accumMs = 0
  private heroDelegate: FirmwareRgbPreview | null = null

  constructor(public config: RgbProfile, seed = 1) {
    this.core = new AulaWin68ExactRgbEngine(seed)
    this.configure(config, true)
  }

  private isCrossHeroMode(mode: number): boolean {
    return mode >= 100 && mode < 200
  }

  private toHeroDelegateProfile(config: RgbProfile): RgbProfile {
    const k = config.keys
    const heroMode = Math.max(0, Math.min(19, k.mode - 100))
    const normBright = normalizeXsydBrightness(k.brightness)
    return {
      ...config,
      keys: {
        ...k,
        mode: heroMode,
        brightness: normBright * 5,
      },
    }
  }

  public configure(config: RgbProfile, initial = false): void {
    const k = config.keys
    const prevK = this.config?.keys
    if (this.isCrossHeroMode(k.mode)) {
      this.config = config
      const delegateProfile = this.toHeroDelegateProfile(config)
      if (!this.heroDelegate) {
        this.heroDelegate = new FirmwareRgbPreview(delegateProfile)
      } else {
        this.heroDelegate.configure(delegateProfile)
      }
      return
    }
    const rawMode = k.mode >= 200 && k.mode < 300 ? k.mode - 200 : k.mode
    const prevRawMode = prevK ? (prevK.mode >= 200 && prevK.mode < 300 ? prevK.mode - 200 : prevK.mode) : -1
    const extMode = rawMode
    const prevExtMode = prevRawMode
    const normBright = normalizeXsydBrightness(k.brightness)
    const targetInternal = externalToInternalMode(extMode, normBright)

    this.config = config
    this.core.speedIdx = Math.max(0, Math.min(4, k.speed))
    // Map wire brightness 0..4 -> BRIGHT_ROM_TABLE index (0 = Off, 1..4 -> indices 1..5, with 4 = full 80)
    this.core.brightIdx = normBright <= 0 ? 0 : normBright === 4 ? 5 : normBright
    this.core.bitmap = k.reverse ? 0x03 : 0x01

    // Wire colorIndex: 0 = Multicolor (internal colorIdx = 7), 1..7 = Slot 1..7 (internal colorIdx = 0..6)
    const wireColorIdx = xsydColorIndexForZone(k)
    this.core.colorIdx = wireColorIdx === 0 ? 7 : wireColorIdx - 1

    // Update 7-slot palette (if user customized slot colors or selected a custom single RGB)
    for (let i = 0; i < 7; i++) {
      const slotRgb = k.palette?.[i] ?? XSYD_COLOR_SLOTS[i + 1].rgb
      this.core.palette[i] = ((slotRgb[0] & 0xff) << 16) | ((slotRgb[1] & 0xff) << 8) | (slotRgb[2] & 0xff)
    }
    if (!k.mix && this.core.colorIdx >= 0 && this.core.colorIdx <= 6) {
      const [r, g, b] = k.rgb
      this.core.palette[this.core.colorIdx] = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
    }

    // Load 68 per-key colors into `user_rgb` (`0x20001EF8`) with `PP = (row << 5) | col`
    for (const cell of KEYS_68) {
      const color: RgbColor = config.colors?.[cell.keyId] ?? [255, 255, 255]
      const pp = ((cell.row & 0x07) << 5) | (cell.col & 0x1f)
      const rgb24 = ((color[0] & 0xff) << 16) | ((color[1] & 0xff) << 8) | (color[2] & 0xff)
      this.core.userRgb[cell.ledIdx] = ((pp << 24) | rgb24) >>> 0
    }

    if (initial || extMode !== prevExtMode || targetInternal !== this.core.internalMode) {
      this.core.initInternalMode(targetInternal)
      this.core.stepTick()
    } else {
      // Refresh buffer immediately whenever color/palette/mix/speed/reverse changes
      this.core.stepTick()
    }
  }

  public event(keyId: string, pressed: boolean): void {
    if (this.isCrossHeroMode(this.config.keys.mode)) {
      this.heroDelegate?.event(keyId, pressed)
      return
    }
    const cell = WIN68_CELL_BY_KEY_ID.get(keyId)
    if (!cell) return
    this.core.keyTrigger[cell.linearIdx] = pressed ? 2 : 0
    if (pressed && this.core.internalMode >= 24 && this.core.internalMode <= 27) {
      this.core.stepTick()
    }
  }

  public advance(milliseconds: number): void {
    if (this.isCrossHeroMode(this.config.keys.mode)) {
      this.heroDelegate?.advance(milliseconds)
      this.ticks = Math.floor(milliseconds / XSYD_RGB_TICK_MS)
      this.lastTickMs = milliseconds
      return
    }
    const targetTicks = Math.floor(milliseconds / XSYD_RGB_TICK_MS)
    if (targetTicks <= this.ticks) {
      return
    }
    const deltaMs = (targetTicks - this.ticks) * XSYD_RGB_TICK_MS
    this.ticks = targetTicks
    this.accumMs += deltaMs
    const periodMs = this.core.tickPeriodMs
    // Cap catch-up steps to avoid unbounded loops after tab backgrounding
    let steps = Math.min(64, Math.floor(this.accumMs / periodMs))
    if (steps === 0 && this.lastTickMs === 0) {
      steps = 1
    }
    this.accumMs %= periodMs
    for (let i = 0; i < steps; i++) {
      this.core.stepTick()
    }
    this.lastTickMs = milliseconds
  }

  public frame(): {
    keys: LightingFrame
    side: string[]
  } {
    if (this.isCrossHeroMode(this.config.keys.mode) && this.heroDelegate) {
      return {
        keys: this.heroDelegate.frame().keys,
        side: [],
      }
    }
    const normBright = normalizeXsydBrightness(this.config.keys.brightness)
    const brightRom = normBright <= 0 ? 0 : (BRIGHT_ROM_TABLE[this.core.brightIdx] ?? 80)

    // Scale in linear light and encode back to sRGB so the screen preview tracks
    // perceived LED brightness accurately across the 0..4 hardware steps.
    const applyBrightness = (channel: number): number => {
      if (brightRom <= 0 || channel <= 0) return 0
      if (brightRom >= 80) return Math.max(0, Math.min(255, Math.round(channel)))
      const srgb = Math.max(0, Math.min(1, channel / 255))
      const linear = srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4)
      const scaled = linear * (brightRom / 80.0)
      const encoded = scaled <= 0.0031308 ? scaled * 12.92 : 1.055 * Math.pow(scaled, 1 / 2.4) - 0.055
      return Math.max(0, Math.min(255, Math.round(encoded * 255)))
    }

    const keys: LightingFrame = {}
    for (const cell of KEYS_68) {
      if (normBright <= 0 || this.core.internalMode === 0) {
        keys[cell.keyId] = '#000000'
        continue
      }
      const raw = this.core.rgbFb[cell.linearIdx] >>> 0
      const r = applyBrightness((raw >>> 16) & 0xff)
      const g = applyBrightness((raw >>> 8) & 0xff)
      const b = applyBrightness(raw & 0xff)
      keys[cell.keyId] =
        '#' +
        r.toString(16).padStart(2, '0') +
        g.toString(16).padStart(2, '0') +
        b.toString(16).padStart(2, '0')
    }

    return {
      keys,
      side: [],
    }
  }
}
