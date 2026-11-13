/**
 * Daily-glyph cycle logic (D22, F3). Pure: storage and date are injected, so the
 * full-corpus traversal, determinism, and corrupt-state rebuild are verified
 * without a browser or localStorage.
 */
import { describe, expect, it } from 'vitest'
import {
  DAILY_STORAGE_KEY,
  emptyDailyState,
  localDate,
  parseDailyState,
  pickDaily,
  readDailyState,
  writeDailyState,
  type DailyState,
} from '../src/client/daily-state.js'

/** A tiny in-memory Storage face for the read/write helpers. */
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

const CORPUS = ['明', '其', '福', '貞', '亡', '于', '年', '春'] as const
const day = (i: number) => `2026-01-${`${i + 1}`.padStart(2, '0')}`

describe('localDate', () => {
  it('formats the local calendar day, zero-padded', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(localDate(new Date(2026, 10, 13))).toBe('2026-11-13')
  })
})

describe('parseDailyState', () => {
  it('round-trips a valid state', () => {
    const state: DailyState = {
      schemaVersion: 1,
      cycleStart: '2026-01-01',
      seen: ['明', '其'],
      today: { date: '2026-01-02', char: '其' },
    }
    expect(parseDailyState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('accepts a null today', () => {
    const parsed = parseDailyState({ schemaVersion: 1, cycleStart: '2026-01-01', seen: [], today: null })
    expect(parsed?.today).toBeNull()
  })

  it('rejects corrupt shapes instead of throwing', () => {
    expect(parseDailyState(null)).toBeNull()
    expect(parseDailyState([])).toBeNull()
    expect(parseDailyState('x')).toBeNull()
    expect(parseDailyState({ schemaVersion: 2, cycleStart: 'd', seen: [], today: null })).toBeNull()
    expect(parseDailyState({ schemaVersion: 1, cycleStart: 5, seen: [], today: null })).toBeNull()
    expect(parseDailyState({ schemaVersion: 1, cycleStart: 'd', seen: '明', today: null })).toBeNull()
    expect(parseDailyState({ schemaVersion: 1, cycleStart: 'd', seen: [1], today: null })).toBeNull()
    expect(parseDailyState({ schemaVersion: 1, cycleStart: 'd', seen: [], today: { date: 'd' } })).toBeNull()
  })
})

describe('pickDaily', () => {
  it('returns an empty pick for an empty corpus', () => {
    const state = emptyDailyState(day(0))
    expect(pickDaily(state, [], day(0))).toEqual({ state, char: '' })
  })

  it('is deterministic for the same state, corpus, and date', () => {
    const state = emptyDailyState(day(0))
    const a = pickDaily(state, CORPUS, day(0))
    const b = pickDaily(state, CORPUS, day(0))
    expect(a.char).toBe(b.char)
    expect(a.state).toEqual(b.state)
    expect(CORPUS).toContain(a.char)
  })

  it('keeps the same glyph across same-day revisits without advancing the cycle', () => {
    const first = pickDaily(emptyDailyState(day(0)), CORPUS, day(0))
    const again = pickDaily(first.state, CORPUS, day(0))
    expect(again.char).toBe(first.char)
    expect(again.state).toEqual(first.state)
    expect(again.state.seen).toHaveLength(1)
  })

  it('changes the glyph on the next local day and excludes the seen one', () => {
    const first = pickDaily(emptyDailyState(day(0)), CORPUS, day(0))
    const next = pickDaily(first.state, CORPUS, day(1))
    expect(next.char).not.toBe(first.char)
    expect(next.state.seen).toHaveLength(2)
    expect(next.state.today).toEqual({ date: day(1), char: next.char })
  })

  it('traverses the whole corpus exactly once, then opens a new cycle', () => {
    let state = emptyDailyState(day(0))
    const picks: string[] = []
    for (let i = 0; i < CORPUS.length; i++) {
      const result = pickDaily(state, CORPUS, day(i))
      picks.push(result.char)
      state = result.state
    }
    // A full round shows every glyph once, in some order.
    expect(picks).toHaveLength(CORPUS.length)
    expect(new Set(picks).size).toBe(CORPUS.length)
    expect([...picks].sort()).toEqual([...CORPUS].sort())
    expect(state.seen).toHaveLength(CORPUS.length)

    // The next day resets the cycle: seen clears, cycleStart moves to today.
    const reset = pickDaily(state, CORPUS, day(CORPUS.length))
    expect(reset.state.cycleStart).toBe(day(CORPUS.length))
    expect(reset.state.seen).toHaveLength(1)
    expect(CORPUS).toContain(reset.char)
  })

  it('re-picks when the cached glyph fell out of the corpus version', () => {
    const state: DailyState = {
      schemaVersion: 1,
      cycleStart: day(0),
      seen: [],
      today: { date: day(0), char: '龘' },
    }
    const result = pickDaily(state, CORPUS, day(0))
    expect(CORPUS).toContain(result.char)
    expect(result.state.today?.char).toBe(result.char)
  })

  it('restarts cleanly when the corpus shrinks below the seen set', () => {
    const state: DailyState = {
      schemaVersion: 1,
      cycleStart: day(0),
      seen: [...CORPUS],
      today: { date: day(0), char: '春' },
    }
    const shrunk = ['福', '貞']
    const result = pickDaily(state, shrunk, day(1))
    expect(shrunk).toContain(result.char)
    expect(result.state.cycleStart).toBe(day(1))
    expect(result.state.seen).toHaveLength(1)
  })
})

describe('readDailyState / writeDailyState', () => {
  it('rebuilds a fresh cycle when storage is absent', () => {
    expect(readDailyState(undefined, day(0))).toEqual(emptyDailyState(day(0)))
  })

  it('rebuilds a fresh cycle when the key is missing', () => {
    expect(readDailyState(fakeStorage(), day(0))).toEqual(emptyDailyState(day(0)))
  })

  it('rebuilds a fresh cycle on corrupt JSON', () => {
    const storage = fakeStorage({ [DAILY_STORAGE_KEY]: '{not json' })
    expect(readDailyState(storage, day(0))).toEqual(emptyDailyState(day(0)))
  })

  it('rebuilds a fresh cycle on a valid-JSON but invalid state', () => {
    const storage = fakeStorage({ [DAILY_STORAGE_KEY]: JSON.stringify({ schemaVersion: 9 }) })
    expect(readDailyState(storage, day(0))).toEqual(emptyDailyState(day(0)))
  })

  it('reads back a persisted state', () => {
    const storage = fakeStorage()
    const state = pickDaily(emptyDailyState(day(0)), CORPUS, day(0)).state
    writeDailyState(storage, state)
    expect(readDailyState(storage, day(0))).toEqual(state)
    expect(storage.dump()[DAILY_STORAGE_KEY]).toBe(JSON.stringify(state))
  })

  it('write is a no-op without storage and swallows quota failures', () => {
    expect(() => writeDailyState(undefined, emptyDailyState(day(0)))).not.toThrow()
    const throwing = {
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(() => writeDailyState(throwing, emptyDailyState(day(0)))).not.toThrow()
  })
})