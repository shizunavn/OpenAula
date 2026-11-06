import { createContext } from 'react'
import { isWin68HeMaxModel, type HeroDeviceFamily, type HeroDeviceModelId } from '../keyboard/devices'

export { isWin68HeMaxModel }
export type { HeroDeviceFamily, HeroDeviceModelId }

export const DeviceModelContext = createContext<HeroDeviceModelId>('hero68')
export const DeviceFamilyContext = createContext<HeroDeviceFamily>('hero')
