/**
 * AULA "WIN 68 HE MAX" — identification only.
 *
 * Facts below are measured from the vendor installer's `config.ini`
 * (vendor id, pid, usage page, usage, board id) and from the report descriptor
 * inside the firmware image (VA 0x1C2EC: vendor page 0xFFA0, usage 0x0001).
 * They are NOT inferred.
 *
 * Protocol facts live in ../protocol/xsyd (framing + checksum only) until the
 * key position map and Hall stream layout are proven; this module stays
 * identification-only so a guess cannot overwrite real calibration.
 */

/** `[General] VID=7247 PID=61064` and `[Device_3GL0fD]`, same pair. */
const SPRING = { vendorId: 0x1c4f, productId: 0xee88 } as const
/** `[Device_nch1G7] VID=7330 PID=6401`. */
const SPRING_ALT = { vendorId: 0x1ca2, productId: 0x1901 } as const

/** Every (VID, PID) pair the vendor app treats as this board. */
export const MAX_HE_IDS: readonly { vendorId: number; productId: number }[] = [SPRING, SPRING_ALT]

/**
 * `usage_page=65440` (0xFFA0) and `usage=1` in every config.ini section, and
 * the report descriptor at firmware VA 0x1C2EC (`06 A0 FF 09 01 A1 01`).
 * Report id is 0; each report carries 64 payload bytes after that id.
 */
export const MAX_HE_USAGE_PAGE = 0xffa0
export const MAX_HE_USAGE = 1

/** `boardID=100800769` (`0x06021A01`). */
export const MAX_HE_BOARD_ID = 100800769

/** Product name suffix the vendor app uses for this model family. */
export const MAX_HE_NAME_PATTERN = /\b68\s*HE\s*MAX\b/i

export function isMaxHeVendorProduct(vendorId: number, productId: number): boolean {
  return MAX_HE_IDS.some(id => id.vendorId === vendorId && id.productId === productId)
}
