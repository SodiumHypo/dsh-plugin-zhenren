/**
 * 干支日 calculation (CLAUDE.md §4.4, §4.5).
 *
 * The opening of the 前辞 is fixed by the host, so this arithmetic is part of
 * the visible product. The anchors below are independently known days.
 */
import { describe, expect, it } from 'vitest'
import { canonicalPrefix, dayGanzhi, julianDayNumber } from '../src/ritual/ganzhi.js'

describe('day ganzhi', () => {
  it('matches known anchor days', () => {
    // 1949-10-01 was 甲子日.
    expect(dayGanzhi(new Date(1949, 9, 1, 12))).toBe('甲子')
    // 2000-01-01 was 戊午日.
    expect(dayGanzhi(new Date(2000, 0, 1, 12))).toBe('戊午')
  })

  it('advances by one stem and one branch per day', () => {
    expect(dayGanzhi(new Date(2026, 10, 10, 12))).toBe('戊子')
    expect(dayGanzhi(new Date(2026, 10, 11, 12))).toBe('己丑')
  })

  it('is stable across the local day and independent of the time of day', () => {
    expect(dayGanzhi(new Date(2026, 10, 10, 0, 5))).toBe(dayGanzhi(new Date(2026, 10, 10, 23, 55)))
  })

  it('computes a positive Julian Day Number', () => {
    expect(julianDayNumber(1949, 10, 1)).toBe(2433191)
  })

  it('builds the canonical 前辞 opening', () => {
    expect(canonicalPrefix(new Date(2026, 10, 10, 9), '鱼')).toBe('戊子卜，鱼贞：')
  })
})
