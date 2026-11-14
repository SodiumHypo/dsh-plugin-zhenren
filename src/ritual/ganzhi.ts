/**
 * Sexagenary day (干支日) for the local calendar date.
 *
 * Oracle-bone 前辞 normally opens with the day's 干支 and the diviner's name
 * (for example 「戊子卜，鱼贞：」). The model has no reliable access to the
 * machine's local date, so the host computes it and hands the canonical prefix
 * to the model / inscription.
 *
 * Anchor: 1949-10-01 was 甲子. The day boundary follows local midnight;
 * traditional 子时 reckoning is deliberately not modelled.
 */

const STEMS = '甲乙丙丁戊己庚辛壬癸'
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥'

/** Gregorian calendar date → Julian Day Number (integer, noon-based). */
export function julianDayNumber(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  )
}

/** The day's 干支, e.g. `戊子`. Uses the local calendar date of `date`. */
export function dayGanzhi(date: Date = new Date()): string {
  const jdn = julianDayNumber(date.getFullYear(), date.getMonth() + 1, date.getDate())
  const index = (((jdn + 49) % 60) + 60) % 60
  return `${STEMS[index % 10]}${BRANCHES[index % 12]}`
}

/** Fixed opening of the 前辞: `<干支>卜，<贞人名>贞：`. */
export function canonicalPrefix(date: Date, divinerName: string): string {
  return `${dayGanzhi(date)}卜，${divinerName}贞：`
}
