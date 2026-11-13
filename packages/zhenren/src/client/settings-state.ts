/**
 * Client settings + update-cache state (D22/D24, F4).
 *
 * All user state lives in plugin-namespaced localStorage keys, outside the npm
 * package, so an overwrite update preserves it (D24). This module is pure: it
 * takes a storage handle and never touches `localStorage` itself, so tests inject
 * fixtures. Corrupt or missing state rebuilds defaults rather than throwing.
 *
 * The update check is the single bounded runtime network exemption (D20): a GET
 * of public registry metadata, at most once per local day, disableable, silent on
 * failure, uploading nothing. The registry URLs below are the real public targets
 * — never a temporary proxy.
 */

/** Stable, install-path-independent storage keys (D22). */
export const SETTINGS_STORAGE_KEY = 'zhenren.settings.v1'
export const UPDATE_STORAGE_KEY = 'zhenren.update.v1'
/** Namespace prefix; 「清除本地配置」 removes only keys under it (D24). */
export const ZHENREN_KEY_PREFIX = 'zhenren.'

/** Real public registry metadata documents for this package (D20). */
export const NPM_PUBLIC_URL = 'https://registry.npmjs.org/dsh-plugin-zhenren'
export const NPM_MIRROR_URL = 'https://registry.npmmirror.com/dsh-plugin-zhenren'

/** Which registry the update check queries. */
export type RegistryChoice = 'npmjs' | 'npmmirror' | 'custom'

/** Persisted user preferences (D24). */
export interface ZhenrenSettings {
  /** Whether the bounded update check runs at all. */
  updateCheck: boolean
  registry: RegistryChoice
  /** Full metadata URL used when `registry` is 'custom'. */
  customRegistry: string
}

/** Cached result of the last update check (D22). */
export interface UpdateCache {
  /** Local date (YYYY-MM-DD) of the last check; gates the once-per-day bound. */
  checkedAt: string
  /** The registry's `dist-tags.latest`, or null when the check failed. */
  latest: string | null
}

export const DEFAULT_SETTINGS: ZhenrenSettings = {
  updateCheck: true,
  registry: 'npmjs',
  customRegistry: '',
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Resolve the metadata URL for the current settings. A malformed custom URL falls
 * back to the public registry rather than guessing or using a proxy (D20).
 */
export function registryUrl(settings: ZhenrenSettings): string {
  if (settings.registry === 'npmmirror') return NPM_MIRROR_URL
  if (settings.registry === 'custom') {
    const url = settings.customRegistry.trim()
    if (/^https?:\/\//i.test(url)) return url
    return NPM_PUBLIC_URL
  }
  return NPM_PUBLIC_URL
}

/** Validate persisted settings; null means "corrupt, rebuild defaults". */
export function parseSettings(value: unknown): ZhenrenSettings | null {
  if (!isObject(value)) return null
  if (typeof value.updateCheck !== 'boolean') return null
  if (value.registry !== 'npmjs' && value.registry !== 'npmmirror' && value.registry !== 'custom') return null
  if (typeof value.customRegistry !== 'string') return null
  return { updateCheck: value.updateCheck, registry: value.registry, customRegistry: value.customRegistry }
}

/** Validate a persisted update cache; null means "missing or corrupt". */
export function parseUpdateCache(value: unknown): UpdateCache | null {
  if (!isObject(value)) return null
  if (typeof value.checkedAt !== 'string') return null
  if (value.latest !== null && typeof value.latest !== 'string') return null
  return { checkedAt: value.checkedAt, latest: value.latest }
}

/** Minimal storage faces, so tests inject a fake and node can pass nothing. */
export type ReadStorage = Pick<Storage, 'getItem'>
export type WriteStorage = Pick<Storage, 'setItem'>
export type ClearableStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>

/** Read settings, falling back to defaults on any failure. */
export function readSettings(storage: ReadStorage | undefined): ZhenrenSettings {
  if (storage === undefined) return { ...DEFAULT_SETTINGS }
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_SETTINGS }
    return parseSettings(JSON.parse(raw)) ?? { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Persist settings; quota/private-mode failures are swallowed. */
export function writeSettings(storage: WriteStorage | undefined, settings: ZhenrenSettings): void {
  if (storage === undefined) return
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Preferences are a convenience, never a hard requirement.
  }
}

/** Read the update cache, or null when absent/corrupt. */
export function readUpdateCache(storage: ReadStorage | undefined): UpdateCache | null {
  if (storage === undefined) return null
  try {
    const raw = storage.getItem(UPDATE_STORAGE_KEY)
    if (raw === null) return null
    return parseUpdateCache(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Persist the update cache; failures are swallowed. */
export function writeUpdateCache(storage: WriteStorage | undefined, cache: UpdateCache): void {
  if (storage === undefined) return
  try {
    storage.setItem(UPDATE_STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore.
  }
}

/**
 * Remove only this plugin's namespaced keys (D24). Returns the removed keys so the
 * UI can confirm what was cleared. Keys are collected before removal so index
 * shifting during iteration cannot skip any. Other plugins' keys are untouched.
 */
export function clearZhenrenStorage(storage: ClearableStorage | undefined): string[] {
  if (storage === undefined) return []
  const keys: string[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key !== null && key.startsWith(ZHENREN_KEY_PREFIX)) keys.push(key)
  }
  for (const key of keys) {
    try {
      storage.removeItem(key)
    } catch {
      // Ignore a single failed removal; continue with the rest.
    }
  }
  return keys
}