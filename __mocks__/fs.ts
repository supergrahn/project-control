import { vi } from 'vitest'
import { createRequire } from 'module'

const actualFs = createRequire(import.meta.url)('fs')

const fsMock = {
  ...actualFs,
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}

export default fsMock
export const existsSync = fsMock.existsSync
export const readdirSync = fsMock.readdirSync
