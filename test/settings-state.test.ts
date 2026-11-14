/**
 * Settings + update-cache state (D22/D24, F4). Pure: storage is injected, so the
 * namespaced clear, corrupt-state rebuild, and registry resolution are verified
 * without a browser.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  NPM_MIRROR_URL,
  NPM_PUBLIC_URL,
  SETTINGS_STORAGE_KEY,
  UPDATE_STORAGE_KEY,
  clearZhenrenStorage,
  parseSettings,
  parseUpdateCache,
  readSettings,
  readUpdateCache,
  registryUrl,
  writeSettings,
  writeUpdateCache,
  type ZhenrenSettings,
} from '../src/client/settings-state.js'

function fakeStorage(initial?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    dump: () => Object.fromEntries(map),
  }
}

/** A clearable storage backed by an array, so removal shifts indices like the real one. */
function fakeClearable(keys: string[]) {
  let arr = [...keys]
  return {
    get length() {
      return arr.length
    },
    key: (index: number) => arr[index] ?? null,
    removeItem: (key: string) => {
      arr = arr.filter((k) => k !== key)
    },
    remaining: () => [...arr],
  }
}

describe('registryUrl', () => {
  it('resolves the real public targets (never a proxy)', () => {
    expect(registryUrl({ ...DEFAULT_SETTINGS, registry: 'npmjs' })).toBe(NPM_PUBLIC_URL)
    expect(registryUrl({ ...DEFAULT_SETTINGS, registry: 'npmmirror' })).toBe(NPM_MIRROR_URL)
    expect(NPM_PUBLIC_URL).toBe('https://registry.npmjs.org/dsh-plugin-zhenren')
    expect(NPM_MIRROR_URL).toBe('https://registry.npmmirror.com/dsh-plugin-zhenren')
  })

  it('uses a well-formed custom URL, trimmed', () => {
    const settings: ZhenrenSettings = { updateCheck: true, registry: 'custom', customRegistry: '  https://reg.example.com/dsh-plugin-zhenren  ' }
    expect(registryUrl(settings)).toBe('https://reg.example.com/dsh-plugin-zhenren')
  })

  it('falls back to the public registry for a malformed custom URL', () => {
    for (const bad of ['', '   ', 'ftp://x', 'registry.example.com', 'javascript:alert(1)']) {
      expect(registryUrl({ ...DEFAULT_SETTINGS, registry: 'custom', customRegistry: bad })).toBe(NPM_PUBLIC_URL)
    }
  })
})

describe('parseSettings / parseUpdateCache', () => {
  it('round-trips valid settings', () => {
    const settings: ZhenrenSettings = { updateCheck: false, registry: 'custom', customRegistry: 'https://x' }
    expect(parseSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings)
  })

  it('rejects corrupt settings', () => {
    expect(parseSettings(null)).toBeNull()
    expect(parseSettings({ updateCheck: 'yes', registry: 'npmjs', customRegistry: '' })).toBeNull()
    expect(parseSettings({ updateCheck: true, registry: 'proxy', customRegistry: '' })).toBeNull()
    expect(parseSettings({ updateCheck: true, registry: 'npmjs', customRegistry: 5 })).toBeNull()
  })

  it('round-trips a valid update cache, including a null latest', () => {
    expect(parseUpdateCache({ checkedAt: '2026-11-13', latest: '2.1.0' })).toEqual({ checkedAt: '2026-11-13', latest: '2.1.0' })
    expect(parseUpdateCache({ checkedAt: '2026-11-13', latest: null })).toEqual({ checkedAt: '2026-11-13', latest: null })
  })

  it('rejects a corrupt update cache', () => {
    expect(parseUpdateCache(null)).toBeNull()
    expect(parseUpdateCache({ checkedAt: 5, latest: null })).toBeNull()
    expect(parseUpdateCache({ checkedAt: 'd', latest: 5 })).toBeNull()
  })
})

describe('readSettings / writeSettings', () => {
  it('defaults when storage is absent, key missing, or state corrupt', () => {
    expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(readSettings(fakeStorage())).toEqual(DEFAULT_SETTINGS)
    expect(readSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: '{bad' }))).toEqual(DEFAULT_SETTINGS)
    expect(readSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ registry: 'proxy' }) }))).toEqual(DEFAULT_SETTINGS)
  })

  it('reads back persisted settings and swallows write failures', () => {
    const storage = fakeStorage()
    const settings: ZhenrenSettings = { updateCheck: false, registry: 'npmmirror', customRegistry: '' }
    writeSettings(storage, settings)
    expect(readSettings(storage)).toEqual(settings)
    expect(storage.dump()[SETTINGS_STORAGE_KEY]).toBe(JSON.stringify(settings))
    expect(() => writeSettings(undefined, settings)).not.toThrow()
    expect(() => writeSettings({ setItem: () => { throw new Error('quota') } }, settings)).not.toThrow()
  })
})

describe('readUpdateCache / writeUpdateCache', () => {
  it('returns null when absent or corrupt, and reads back a valid cache', () => {
    expect(readUpdateCache(undefined)).toBeNull()
    expect(readUpdateCache(fakeStorage())).toBeNull()
    expect(readUpdateCache(fakeStorage({ [UPDATE_STORAGE_KEY]: '{bad' }))).toBeNull()
    const storage = fakeStorage()
    writeUpdateCache(storage, { checkedAt: '2026-11-13', latest: '2.1.0' })
    expect(readUpdateCache(storage)).toEqual({ checkedAt: '2026-11-13', latest: '2.1.0' })
    expect(() => writeUpdateCache(undefined, { checkedAt: 'd', latest: null })).not.toThrow()
  })
})

describe('clearZhenrenStorage', () => {
  it('is a no-op without storage', () => {
    expect(clearZhenrenStorage(undefined)).toEqual([])
  })

  it('removes only zhenren.* keys, surviving index shifts, leaving others intact', () => {
    const storage = fakeClearable(['other.a', 'zhenren.daily.v1', 'other.b', 'zhenren.settings.v1', 'zhenren.update.v1'])
    const removed = clearZhenrenStorage(storage)
    expect(removed.sort()).toEqual(['zhenren.daily.v1', 'zhenren.settings.v1', 'zhenren.update.v1'])
    expect(storage.remaining().sort()).toEqual(['other.a', 'other.b'])
  })

  it('returns an empty list when nothing is namespaced', () => {
    const storage = fakeClearable(['other.a', 'other.b'])
    expect(clearZhenrenStorage(storage)).toEqual([])
    expect(storage.remaining().sort()).toEqual(['other.a', 'other.b'])
  })
})