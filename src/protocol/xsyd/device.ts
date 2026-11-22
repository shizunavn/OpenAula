/**
 * Barrel re-export for the AULA XSYD (`0x5C`) protocol modules.
 * Concrete implementations live in `./commands`, `./advancedBindings`, `./remap`,
 * `./hydrate`, `./webhid`, `./hall`, and `./rgb`.
 */
import { isWin68HeMaxModel } from '../../keyboard/devices';
import type { Hero68ConnectionState, Hero68DeviceSnapshot } from '../hero68/webhid';

export * from './commands';
export * from './advancedBindings';
export * from './remap';
export * from './hydrate';
export * from './webhid';
export * from './hall';
export * from './rgb';
export { xsydMatrixIndexForKey, xsydMatrixIndexForKeyId } from './hall';
export { isWin68HeMaxModel };
export type { Hero68ConnectionState, Hero68DeviceSnapshot };
