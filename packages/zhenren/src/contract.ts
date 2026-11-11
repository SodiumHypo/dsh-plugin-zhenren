/**
 * Shared contract between the host half and the client half (CLAUDE.md §4.1).
 *
 * Only wire names, presentation types, and pure validators live here. The host
 * never imports client code and the client never imports the host data layer;
 * both bundle their own copy of this file, which is intentional.
 */

/** Wire tool names. The slot key must equal these strings exactly. */
export const TOOL_BURN = 'zhenren_burn'
export const TOOL_INSCRIBE = 'zhenren_inscribe'

/**
 * Presentation-meta version emitted by this build (D17 added `glyphSource`).
 * The parsers also accept v1 metas so restored sessions still draw; see
 * {@link isMetaVersion}.
 */
export const META_VERSION = 2

/**
 * Source attribution returned to the model and shown in card footers.
 * The boundary sentence ("兆纹为艺术化表现……") is product copy owned by the
 * locale dictionary (`card.boundary`), so it must not be duplicated here.
 */
export const ATTRIBUTION =
  '字形：Oracular（OFL-1.1）、HUST-OBC 已释字图像（公有领域，arXiv 2401.15365）。《说文》文本：shuowen.org（Apache-2.0）。数据整理：yigezi（MIT）。'

/**
 * Early v1 metas appended the boundary sentence to `attribution`, while the
 * card also renders the locale `card.boundary` line. Strip the legacy suffix
 * on read so restored sessions do not show the sentence twice.
 */
const LEGACY_BOUNDARY_SUFFIX = '兆纹为艺术化表现，非考古复原。'

function normalizeAttribution(value: string): string {
  const trimmed = value.trimEnd()
  return trimmed.endsWith(LEGACY_BOUNDARY_SUFFIX)
    ? trimmed.slice(0, -LEGACY_BOUNDARY_SUFFIX.length).trimEnd()
    : value
}

/** The single authoritative omen. Derived once per divination by the host. */
export type Auspice = '吉' | '凶' | '中性'

/** Normalized point in [0, 1]². */
export type Vec2 = [number, number]

/**
 * Every presentation type below is a `type` alias, not an `interface`.
 * `presentationMeta` returns `JsonValue`, which has an index signature; only
 * alias types get the implicit index signature that makes them assignable.
 */

/** Rect in normalized coordinates. */
export type Rect = {
  x: number
  y: number
  w: number
  h: number
}

/** A missing span of a crack path. `at` and `length` are path fractions. */
export type CrackBreak = {
  at: number
  length: number
}

/** One polyline of the omen. */
export type CrackPath = {
  points: Vec2[]
  width: number
  breaks: CrackBreak[]
}

/** A secondary crack sprouting from the trunk. */
export type CrackBranch = {
  order: 1 | 2
  /** Position along the trunk (or parent branch for order 2), in [0, 1]. */
  startT: number
  points: Vec2[]
  width: number
  breaks: CrackBreak[]
}

/** Complete, replayable visual specification of one omen. */
export type CrackSpec = {
  version: 1
  main: CrackPath
  branches: CrackBranch[]
  /** 0 = cold, 1 = warm. The client maps this to color and flicker. */
  glow: { radius: number; temperature: number; fadeMs: number }
  bounds: Rect
}

/** Semantic summary of the geometry, for the model's wording only. */
export type OmenReading = {
  mainDirection: 'up' | 'down' | 'level'
  branchPattern: 'continuous' | 'broken' | 'symmetric'
  /** 0..1 */
  intensity: number
}

/** Client-side animation level carried in meta from the host config. */
export type AnimationLevel = 'full' | 'reduced' | 'off'

/** Rendering branch of a carved glyph (D17): font codepoint or HUST image. */
export type MetaGlyphSource = 'font' | 'image'

/**
 * One carved slot as the client must draw it.
 *
 * Every field is required and nullable instead of optional: `JsonValue` has an
 * index signature, and optional properties (`T | undefined`) are not assignable
 * to it. A complete spec is also easier for the renderer to consume.
 */
export type MetaGlyph = {
  slot: number
  char: string
  found: boolean
  /** Codepoint to draw from the oracle font; null for a 空刻 placeholder. */
  glyphChar: string | null
  /** True when the slot is deliberately left blank (空刻). */
  placeholder: boolean
  /** Which renderer draws this slot. v1 metas default to `font`. */
  glyphSource: MetaGlyphSource
}

/** One slot position in normalized coordinates. */
export type MetaSlot = {
  index: number
  column: number
  row: number
  x: number
  y: number
  /** Nominal glyph box size in normalized units. */
  size: number
}

/** Per-character carving rhythm. `startMs` is relative to this card's timeline. */
export type CarveStep = {
  slot: number
  startMs: number
  durationMs: number
  pressure: number
  maskSeed: number
}

/** One gloss the model asked the card to show. */
export type HighlightGloss = {
  char: string
  original: string
  vernacular: string
  correction: string | null
}

/** `presentationMeta` of `zhenren_burn`. */
export type BurnPresentationMeta = {
  version: typeof META_VERSION
  kind: 'zhenren.burn'
  divinationId: string
  seed: string
  question: string
  charge: string
  /** Day's 干支 at burn time; used by the fixed 前辞 opening. */
  dayGanzhi: string
  /** Canonical opening, e.g. `戊子卜，鱼贞：`. */
  prefix: string
  auspice: Auspice
  burnPoint: { x: number; y: number }
  shellSeed: string
  cracks: CrackSpec
  /** Presentation choices copied from host config (CLAUDE.md §4.10). */
  animation: AnimationLevel
  showShuowen: boolean
  locale: string
  /** Corpus size (glyphs.size) for the dynamic footer boundary line (D19). */
  supportedCount: number
  attribution: string
}

/** `presentationMeta` of `zhenren_inscribe`. */
export type InscribePresentationMeta = {
  version: typeof META_VERSION
  kind: 'zhenren.inscribe'
  /** False when the inscription could not be laid out at all. */
  ok: boolean
  divinationId: string
  burnSeed: string
  /** Echoed from the burn card when the in-process cache still has it. */
  auspice: Auspice | null
  cracks: CrackSpec | null
  glyphs: MetaGlyph[]
  layout: { columns: number; direction: 'ltr' | 'rtl'; slots: MetaSlot[] }
  carve: { version: 1; chars: CarveStep[] }
  highlightGlosses: HighlightGloss[]
  animation: AnimationLevel
  showShuowen: boolean
  locale: string
  /** Corpus size (glyphs.size) for the dynamic footer boundary line (D19). */
  supportedCount: number
  attribution: string
}

// ---------------------------------------------------------------------------
// Validation (client side; a malformed meta must degrade, never throw)
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isVec2(value: unknown): value is Vec2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isUnit(value[0]) &&
    isUnit(value[1])
  )
}

function readPath(value: unknown): CrackPath | null {
  if (!isObject(value)) return null
  if (!Array.isArray(value.points) || value.points.length < 2) return null
  if (!value.points.every(isVec2)) return null
  if (typeof value.width !== 'number' || !Number.isFinite(value.width)) return null
  if (!Array.isArray(value.breaks)) return null
  const breaks: CrackBreak[] = []
  for (const entry of value.breaks) {
    if (!isObject(entry) || !isUnit(entry.at) || !isUnit(entry.length)) return null
    breaks.push({ at: entry.at, length: entry.length })
  }
  return { points: value.points as Vec2[], width: value.width, breaks }
}

function readRect(value: unknown): Rect | null {
  if (!isObject(value)) return null
  if (!isUnit(value.x) || !isUnit(value.y)) return null
  if (typeof value.w !== 'number' || typeof value.h !== 'number') return null
  if (!Number.isFinite(value.w) || !Number.isFinite(value.h)) return null
  return { x: value.x, y: value.y, w: value.w, h: value.h }
}

/** Validate a `CrackSpec`. Returns `null` for anything the client cannot draw. */
export function parseCrackSpec(value: unknown): CrackSpec | null {
  if (!isObject(value) || value.version !== 1) return null
  const main = readPath(value.main)
  const bounds = readRect(value.bounds)
  if (main === null || bounds === null) return null
  if (!isObject(value.glow)) return null
  const radius = value.glow.radius
  const temperature = value.glow.temperature
  const fadeMs = value.glow.fadeMs
  if (!isUnit(radius) || !isUnit(temperature)) return null
  if (typeof fadeMs !== 'number' || !Number.isFinite(fadeMs)) return null
  if (!Array.isArray(value.branches)) return null
  const branches: CrackBranch[] = []
  for (const entry of value.branches) {
    const path = readPath(entry)
    if (path === null || !isObject(entry)) return null
    const order = entry.order
    if (order !== 1 && order !== 2) return null
    if (!isUnit(entry.startT)) return null
    branches.push({ ...path, order, startT: entry.startT })
  }
  return {
    version: 1,
    main,
    branches,
    glow: { radius, temperature, fadeMs },
    bounds,
  }
}

function isAuspice(value: unknown): value is Auspice {
  return value === '吉' || value === '凶' || value === '中性'
}

/**
 * Metas this build can draw. v1 predates D17 (font-only glyphs); v2 carries
 * `glyphSource`. Anything newer falls back to text rather than guessing.
 */
function isMetaVersion(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2
}

/**
 * Read a glyph's rendering branch. v1 metas have no `glyphSource` and default
 * to `font`. A v2 found-glyph must carry a valid branch; a missing or unknown
 * one means the meta is corrupt, so the caller falls back to text.
 */
function readGlyphSource(value: unknown, metaVersion: 1 | 2, found: boolean): MetaGlyphSource | null {
  if (value === 'font' || value === 'image') return value
  if (!found || metaVersion === 1) return 'font'
  return null
}

/** Old metas predate these fields; default rather than reject them. */
function readAnimation(value: unknown): AnimationLevel {
  return value === 'reduced' || value === 'off' || value === 'full' ? value : 'full'
}

function readShowShuowen(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true
}

function readLocale(value: unknown): string {
  return typeof value === 'string' && value !== '' ? value : 'zh-CN'
}

/**
 * Corpus size for the footer boundary line (D19). Old metas predates the field;
 * degrade to 0 so the card omits the count line rather than rejecting the meta.
 */
function readSupportedCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

/** Validate a burn meta. Returns `null` when the card must fall back to text. */
export function parseBurnMeta(value: unknown): BurnPresentationMeta | null {
  if (!isObject(value)) return null
  if (!isMetaVersion(value.version) || value.kind !== 'zhenren.burn') return null
  const { divinationId, seed, question, charge, shellSeed, attribution } = value
  if (typeof divinationId !== 'string' || typeof seed !== 'string') return null
  if (typeof question !== 'string' || typeof charge !== 'string') return null
  if (typeof shellSeed !== 'string' || typeof attribution !== 'string') return null
  if (!isAuspice(value.auspice)) return null
  if (!isObject(value.burnPoint)) return null
  if (!isUnit(value.burnPoint.x) || !isUnit(value.burnPoint.y)) return null
  const cracks = parseCrackSpec(value.cracks)
  if (cracks === null) return null
  return {
    version: META_VERSION,
    kind: 'zhenren.burn',
    divinationId,
    seed,
    question,
    charge,
    dayGanzhi: typeof value.dayGanzhi === 'string' ? value.dayGanzhi : '',
    prefix: typeof value.prefix === 'string' ? value.prefix : '',
    auspice: value.auspice,
    burnPoint: { x: value.burnPoint.x, y: value.burnPoint.y },
    shellSeed,
    cracks,
    animation: readAnimation(value.animation),
    showShuowen: readShowShuowen(value.showShuowen),
    locale: readLocale(value.locale),
    supportedCount: readSupportedCount(value.supportedCount),
    attribution: normalizeAttribution(attribution),
  }
}

/** Validate an inscribe meta. Returns `null` when the card must fall back. */
export function parseInscribeMeta(value: unknown): InscribePresentationMeta | null {
  if (!isObject(value)) return null
  if (!isMetaVersion(value.version) || value.kind !== 'zhenren.inscribe') return null
  const metaVersion = value.version
  const { divinationId, burnSeed, attribution } = value
  if (typeof divinationId !== 'string' || typeof burnSeed !== 'string') return null
  if (typeof attribution !== 'string') return null
  if (!Array.isArray(value.glyphs)) return null

  const glyphs: MetaGlyph[] = []
  for (const entry of value.glyphs) {
    if (!isObject(entry)) return null
    if (typeof entry.slot !== 'number' || typeof entry.char !== 'string') return null
    if (typeof entry.found !== 'boolean') return null
    const glyphSource = readGlyphSource(entry.glyphSource, metaVersion, entry.found)
    if (glyphSource === null) return null
    if (entry.found) {
      if (typeof entry.glyphChar !== 'string') return null
      glyphs.push({
        slot: entry.slot,
        char: entry.char,
        found: true,
        glyphChar: entry.glyphChar,
        placeholder: false,
        glyphSource,
      })
    } else {
      glyphs.push({
        slot: entry.slot,
        char: entry.char,
        found: false,
        glyphChar: null,
        placeholder: true,
        glyphSource,
      })
    }
  }

  if (!isObject(value.layout) || !Array.isArray(value.layout.slots)) return null
  if (typeof value.layout.columns !== 'number') return null
  if (value.layout.direction !== 'rtl' && value.layout.direction !== 'ltr') return null
  const slots: MetaSlot[] = []
  for (const entry of value.layout.slots) {
    if (!isObject(entry)) return null
    if (typeof entry.index !== 'number' || typeof entry.column !== 'number') return null
    if (typeof entry.row !== 'number') return null
    if (!isUnit(entry.x) || !isUnit(entry.y)) return null
    if (typeof entry.size !== 'number' || !Number.isFinite(entry.size)) return null
    slots.push({
      index: entry.index,
      column: entry.column,
      row: entry.row,
      x: entry.x,
      y: entry.y,
      size: entry.size,
    })
  }

  if (!isObject(value.carve) || !Array.isArray(value.carve.chars)) return null
  if (value.carve.version !== 1) return null
  const chars: CarveStep[] = []
  for (const entry of value.carve.chars) {
    if (!isObject(entry)) return null
    if (typeof entry.slot !== 'number' || typeof entry.startMs !== 'number') return null
    if (typeof entry.durationMs !== 'number' || typeof entry.pressure !== 'number') return null
    if (typeof entry.maskSeed !== 'number') return null
    chars.push({
      slot: entry.slot,
      startMs: entry.startMs,
      durationMs: entry.durationMs,
      pressure: entry.pressure,
      maskSeed: entry.maskSeed,
    })
  }

  if (!Array.isArray(value.highlightGlosses)) return null
  const highlightGlosses: HighlightGloss[] = []
  for (const entry of value.highlightGlosses) {
    if (!isObject(entry)) return null
    if (typeof entry.char !== 'string' || typeof entry.original !== 'string') return null
    if (typeof entry.vernacular !== 'string') return null
    if (entry.correction !== null && typeof entry.correction !== 'string') return null
    highlightGlosses.push({
      char: entry.char,
      original: entry.original,
      vernacular: entry.vernacular,
      correction: entry.correction,
    })
  }

  return {
    version: META_VERSION,
    kind: 'zhenren.inscribe',
    ok: typeof value.ok === 'boolean' ? value.ok : true,
    divinationId,
    burnSeed,
    auspice: isAuspice(value.auspice) ? value.auspice : null,
    cracks: parseCrackSpec(value.cracks),
    glyphs,
    layout: { columns: value.layout.columns, direction: value.layout.direction, slots },
    carve: { version: 1, chars },
    highlightGlosses,
    animation: readAnimation(value.animation),
    showShuowen: readShowShuowen(value.showShuowen),
    locale: readLocale(value.locale),
    supportedCount: readSupportedCount(value.supportedCount),
    attribution: normalizeAttribution(attribution),
  }
}
