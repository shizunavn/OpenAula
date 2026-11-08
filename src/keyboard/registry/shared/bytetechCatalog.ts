import catalog from '../../../protocol/hero68/remapCatalog.json';
import type { BoardDescriptor, BoardRemapLayers, HeroKeyRow } from '../types';
export const BYTETECH_VENDOR_ID = 0x372e;
export const BYTETECH_USAGE_PAGE = 0xff60;
export const BYTETECH_USAGE = 0x0061;
export const BYTETECH_REPORT_ID = 0x09;
export function wootilityHueColor(hue: number): string {
  return `hsl(${hue} 80% 41%)`;
}
export function computeKeyCoordinates(
  rows: readonly HeroKeyRow[]
): Readonly<Record<string, readonly [number, number]>> {
  const coordinates: Record<string, readonly [number, number]> = {};
  for (const [y, row] of rows.entries()) {
    let x = 0;
    for (const key of row) {
      const width = key.width ?? 1;
      if (!key.spacer) {
        coordinates[key.id] = [x + width / 2, y] as const;
      }
      x += width;
    }
  }
  return coordinates;
}
/** Interactive key IDs in row order; padding slots of short rows are skipped. */
export function keyIdsOf(rows: readonly HeroKeyRow[]): string[] {
  return rows
    .flat()
    .filter(key => !key.spacer)
    .map(key => key.id);
}
export function buildDemoLightingFromHues(
  rows: readonly HeroKeyRow[],
  hues: Readonly<Record<string, number>>
): Record<string, string> {
  const frame: Record<string, string> = {};
  for (const key of rows.flat()) {
    if (key.spacer) {
      continue;
    }
    if (key.id === 'Space') {
      const gradientStops = [240, 210, 180, 150, 120, 91, 68]
        .map(
          (hue, index, values) =>
            `${wootilityHueColor(hue)} ${Math.round((index / (values.length - 1)) * 100)}%`
        )
        .join(', ');
      frame[key.id] = `linear-gradient(90deg, ${gradientStops})`;
      continue;
    }
    frame[key.id] = wootilityHueColor(hues[key.id] ?? 0);
  }
  return frame;
}
export function buildFactoryRemapLayersFromCatalog(
  posToKeyId: ReadonlyMap<number, string>,
  extraFactoryKeycodes: Readonly<Record<string, number>> = {}
): BoardRemapLayers {
  const result: BoardRemapLayers = {
    0: {},
    1: {},
    2: {}
  };
  for (const layer of catalog.layers) {
    const layerIndex = layer.layer as 0 | 1 | 2;
    for (const key of layer.keys) {
      const keyId = posToKeyId.get(key.pos);
      if (keyId) {
        result[layerIndex][keyId] = key.value;
      }
    }
  }
  for (const [keyId, keycode] of Object.entries(extraFactoryKeycodes)) {
    for (const layerIndex of [0, 1, 2] as const) {
      if (result[layerIndex][keyId] === undefined) {
        result[layerIndex][keyId] = keycode;
      }
    }
  }
  return result;
}
export function assertBoardDescriptorValid(board: BoardDescriptor): void {
  if (board.rows.length !== board.capabilities.rowCount) {
    throw new Error(
      `Board "${board.id}" declares rowCount=${board.capabilities.rowCount} but has ${board.rows.length} rows`
    );
  }
  const interactiveKeys = board.rows.flat().filter(key => !key.spacer);
  if (interactiveKeys.length !== board.capabilities.keyCount) {
    throw new Error(
      `Board "${board.id}" declares keyCount=${board.capabilities.keyCount} but has ${interactiveKeys.length} keys`
    );
  }
  if (board.keyIds.length !== interactiveKeys.length) {
    throw new Error(
      `Board "${board.id}" keyIds length (${board.keyIds.length}) does not match interactive keys (${interactiveKeys.length})`
    );
  }
  if (board.keyIdSet.size !== board.keyIds.length) {
    throw new Error(`Board "${board.id}" has duplicate key IDs`);
  }
  for (const [rowIndex, row] of board.rows.entries()) {
    const rowWidth = row.reduce((sum, key) => sum + (key.width ?? 1), 0);
    if (Math.abs(rowWidth - board.capabilities.widthUnits) > 1e-6) {
      throw new Error(
        `Board "${board.id}" row ${rowIndex} width is ${rowWidth}U, expected ${board.capabilities.widthUnits}U`
      );
    }
  }
  const mappedKeyIds = Object.keys(board.keyIdToPos);
  if (mappedKeyIds.length !== board.keyIds.length) {
    throw new Error(
      `Board "${board.id}" keyIdToPos has ${mappedKeyIds.length} entries but layout declares ${board.keyIds.length} keys`
    );
  }
  for (const keyId of board.keyIds) {
    if (!(keyId in board.keyIdToPos)) {
      throw new Error(`Board "${board.id}" keyIdToPos is missing frontend key id "${keyId}"`);
    }
  }
  const positions = Object.values(board.keyIdToPos);
  if (new Set(positions).size !== positions.length) {
    throw new Error(`Board "${board.id}" assigns the same hardware pos to more than one key id`);
  }
  if (
    board.posToKeyId.size !== positions.length ||
    board.validPositions.size !== positions.length
  ) {
    throw new Error(`Board "${board.id}" posToKeyId / validPositions size mismatch`);
  }
  for (const [keyId, pos] of Object.entries(board.keyIdToPos)) {
    if (board.posToKeyId.get(pos) !== keyId) {
      throw new Error(`Board "${board.id}" posToKeyId mismatch for ${keyId} -> ${pos}`);
    }
  }
}
