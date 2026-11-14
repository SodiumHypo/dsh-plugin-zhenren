/**
 * Bounded update check (D20, F4).
 *
 * The single runtime network exemption: a GET of public registry metadata, at
 * most once per local day, disableable, silent on failure, uploading nothing. It
 * only ever reads `dist-tags.latest` and compares it to the build-time version;
 * it never downloads, installs, or auto-updates (D24). Pure helpers take their
 * inputs (cache, date, settings, fetch impl) so the bound and the comparison are
 * testable without a network.
 */
import type { UpdateCache, ZhenrenSettings } from './settings-state.js'

/**
 * Whether a check is due: enabled, and either never checked or last checked on a
 * different local day. This enforces the once-per-day bound (D20).
 */
export function shouldCheckUpdate(
  cache: UpdateCache | null,
  date: string,
  settings: ZhenrenSettings,
): boolean {
  if (!settings.updateCheck) return false
  return cache === null || cache.checkedAt !== date
}

/**
 * GET the registry metadata and read `dist-tags.latest`. Any failure (network,
 * CORS, non-OK status, malformed JSON, missing tag) resolves to null — the check
 * is silent and never blocks the conversation (D20). `fetchImpl` is injectable for
 * tests; it defaults to the global fetch.
 */
export async function fetchLatestVersion(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const data: unknown = await response.json()
    if (typeof data !== 'object' || data === null) return null
    const tags = (data as Record<string, unknown>)['dist-tags']
    if (typeof tags !== 'object' || tags === null) return null
    const latest = (tags as Record<string, unknown>).latest
    return typeof latest === 'string' && latest !== '' ? latest : null
  } catch {
    return null
  }
}

interface ParsedVersion {
  core: [number, number, number]
  pre: string[]
}

function parseVersion(value: string): ParsedVersion {
  const dash = value.indexOf('-')
  const main = dash === -1 ? value : value.slice(0, dash)
  const pre = dash === -1 ? '' : value.slice(dash + 1)
  const parts = main.split('.').map((n) => {
    const parsed = Number.parseInt(n, 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
  return {
    core: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0],
    pre: pre === '' ? [] : pre.split('.'),
  }
}

/** Semver prerelease precedence: numeric identifiers compare numerically and rank
 * below alphanumeric ones; a shorter identifier list ranks lower (semver §11). */
function comparePre(a: string[], b: string[]): number {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index++) {
    const x = a[index]
    const y = b[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      const diff = Number.parseInt(x, 10) - Number.parseInt(y, 10)
      if (diff !== 0) return diff < 0 ? -1 : 1
    } else if (xNumeric) {
      return -1
    } else if (yNumeric) {
      return 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** Compare two versions: negative when a < b, positive when a > b, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let index = 0; index < 3; index++) {
    const a = pa.core[index] ?? 0
    const b = pb.core[index] ?? 0
    if (a !== b) return a < b ? -1 : 1
  }
  // Equal core: a release outranks any prerelease.
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1
  return comparePre(pa.pre, pb.pre)
}

/** True when `latest` is strictly newer than the running `current` version. */
export function isNewerVersion(current: string, latest: string): boolean {
  return compareVersions(current, latest) < 0
}