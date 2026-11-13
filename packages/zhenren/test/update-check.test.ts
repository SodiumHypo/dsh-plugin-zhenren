/**
 * Bounded update check (D20, F4). The once-per-day gate, the silent fetch, and the
 * version comparison are pure or use an injected fetch, so no network is touched.
 */
import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  fetchLatestVersion,
  isNewerVersion,
  shouldCheckUpdate,
} from '../src/client/update-check.js'
import { DEFAULT_SETTINGS, type UpdateCache, type ZhenrenSettings } from '../src/client/settings-state.js'

const enabled: ZhenrenSettings = { ...DEFAULT_SETTINGS, updateCheck: true }
const disabled: ZhenrenSettings = { ...DEFAULT_SETTINGS, updateCheck: false }

/** A fetch stub returning a canned Response; assignable to typeof fetch. */
const returning = (response: Response) => async (): Promise<Response> => response
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('shouldCheckUpdate', () => {
  it('never checks when disabled', () => {
    expect(shouldCheckUpdate(null, '2026-11-13', disabled)).toBe(false)
    expect(shouldCheckUpdate({ checkedAt: '2026-11-12', latest: '2.0.0' }, '2026-11-13', disabled)).toBe(false)
  })

  it('checks when enabled and never checked, or last checked on another day', () => {
    expect(shouldCheckUpdate(null, '2026-11-13', enabled)).toBe(true)
    expect(shouldCheckUpdate({ checkedAt: '2026-11-12', latest: null }, '2026-11-13', enabled)).toBe(true)
  })

  it('does not re-check on the same local day (the once-per-day bound)', () => {
    const cache: UpdateCache = { checkedAt: '2026-11-13', latest: '2.0.0' }
    expect(shouldCheckUpdate(cache, '2026-11-13', enabled)).toBe(false)
  })
})

describe('fetchLatestVersion', () => {
  it('reads dist-tags.latest from a successful response', async () => {
    const fetchImpl = returning(json({ 'dist-tags': { latest: '2.1.0' } }))
    expect(await fetchLatestVersion('https://registry.npmjs.org/dsh-plugin-zhenren', fetchImpl)).toBe('2.1.0')
  })

  it('resolves null on a non-OK status', async () => {
    expect(await fetchLatestVersion('u', returning(new Response('no', { status: 500 })))).toBeNull()
  })

  it('resolves null on malformed JSON', async () => {
    expect(await fetchLatestVersion('u', returning(new Response('{bad', { status: 200 })))).toBeNull()
  })

  it('resolves null when the tag is missing, empty, or not a string', async () => {
    expect(await fetchLatestVersion('u', returning(json({})))).toBeNull()
    expect(await fetchLatestVersion('u', returning(json({ 'dist-tags': {} })))).toBeNull()
    expect(await fetchLatestVersion('u', returning(json({ 'dist-tags': { latest: '' } })))).toBeNull()
    expect(await fetchLatestVersion('u', returning(json({ 'dist-tags': { latest: 5 } })))).toBeNull()
    expect(await fetchLatestVersion('u', returning(json(null)))).toBeNull()
  })

  it('resolves null when the network rejects (silent failure)', async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new Error('network down')
    }
    expect(await fetchLatestVersion('u', fetchImpl)).toBeNull()
  })
})

describe('compareVersions / isNewerVersion', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '2.1.0')).toBeLessThan(0)
    expect(compareVersions('2.1.0', '2.1.1')).toBeLessThan(0)
    expect(compareVersions('2.1.1', '2.1.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0)
  })

  it('ranks a release above its prerelease', () => {
    expect(compareVersions('2.0.0', '2.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0-beta.1', '2.0.0')).toBeLessThan(0)
    expect(isNewerVersion('2.0.0-beta.1', '2.0.0')).toBe(true)
    expect(isNewerVersion('2.0.0', '2.0.0-beta.1')).toBe(false)
  })

  it('compares prerelease identifiers with semver precedence', () => {
    expect(compareVersions('2.0.0-beta.2', '2.0.0-beta.10')).toBeLessThan(0)
    expect(compareVersions('2.0.0-1', '2.0.0-alpha')).toBeLessThan(0)
    expect(compareVersions('2.0.0-beta', '2.0.0-beta.1')).toBeLessThan(0)
    expect(compareVersions('2.0.0-alpha', '2.0.0-beta')).toBeLessThan(0)
  })

  it('isNewerVersion is strict', () => {
    expect(isNewerVersion('2.0.0', '2.0.1')).toBe(true)
    expect(isNewerVersion('2.0.0', '2.0.0')).toBe(false)
    expect(isNewerVersion('2.0.1', '2.0.0')).toBe(false)
  })
})