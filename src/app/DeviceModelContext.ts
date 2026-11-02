import { createContext } from 'react'
import type { HeroDeviceModelId } from '../keyboard/devices'

export const DeviceModelContext = createContext<HeroDeviceModelId>('hero68')
