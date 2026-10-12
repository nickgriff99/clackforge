/**
 * Keyboard layouts as data: arrays of
 * `{ id, label, x, y, width, height, row }`. One `<Keyboard layout={...} />`
 * renders any layout.
 *
 * This module generates the 4 layouts (60%, 65%, 75%, TKL) from a small
 * set of reusable row tables instead of hand-authoring ~60-104 objects per
 * layout. Units are generic keycap "u" units (1u = one standard key
 * pitch, a vendor-neutral industry term - not any specific board's mm
 * spec): 1u / 1.25u / 1.5u / 1.75u / 2.25u / 2.75u / 6.25u (spacebar) are
 * the standard ANSI QWERTY row widths used across the hobby regardless of
 * brand.
 *
 * `id` values follow the W3C UI Events `KeyboardEvent.code` standard
 * (e.g. "KeyQ", "Digit1", "ShiftLeft", "ArrowUp") - a public, vendor-neutral
 * spec. This is deliberate: physical keyboard input can match `event.code`
 * straight to a key id with no translation table.
 *
 * `row` is the sculpted-keycap profile row (a generic concept used across
 * the hobby: top/function row, number row, qwerty row, home row, bottom
 * row, space row each get their own keycap height/angle in a sculpted
 * set). Side clusters (nav/arrows) inherit the row index of whichever
 * alpha row they vertically align with, so a future per-row profile
 * lookup stays correct for every key, not just the alpha block.
 */

export type KeyboardLayoutId = "60" | "65" | "75" | "tkl"

export interface KeyDef {
  /** Stable id - matches the W3C `KeyboardEvent.code` value where one exists. */
  id: string
  /** Printed legend. */
  label: string
  /** Left edge, in u. */
  x: number
  /** Top edge, in u (increases downward, row 0 = topmost). */
  y: number
  /** Footprint width, in u. */
  width: number
  /** Footprint depth, in u (almost always 1 - only wide/odd keys like ISO enter differ). */
  height: number
  /** Sculpted-profile row index, 0 = topmost row present in this layout. */
  row: number
}

export interface KeyboardLayoutDef {
  id: KeyboardLayoutId
  label: string
  keys: KeyDef[]
}

// ---------------------------------------------------------------------------
// Row tables (generic ANSI QWERTY convention - shared by every layout)
// ---------------------------------------------------------------------------

interface RowKeySpec {
  id: string
  label: string
  /** Width in u, default 1. */
  width?: number
  /** Extra horizontal gap before this key, in u (used for function-row key groups). */
  gapBefore?: number
}

const letters = "QWERTYUIOP" as const
const homeLetters = "ASDFGHJKL" as const
const bottomLetters = "ZXCVBNM" as const

const FUNCTION_ROW: RowKeySpec[] = [
  { id: "Escape", label: "Esc" },
  { id: "F1", label: "F1", gapBefore: 1 },
  { id: "F2", label: "F2" },
  { id: "F3", label: "F3" },
  { id: "F4", label: "F4" },
  { id: "F5", label: "F5", gapBefore: 0.5 },
  { id: "F6", label: "F6" },
  { id: "F7", label: "F7" },
  { id: "F8", label: "F8" },
  { id: "F9", label: "F9", gapBefore: 0.5 },
  { id: "F10", label: "F10" },
  { id: "F11", label: "F11" },
  { id: "F12", label: "F12" },
]

const NUMBER_ROW: RowKeySpec[] = [
  { id: "Backquote", label: "`" },
  { id: "Digit1", label: "1" },
  { id: "Digit2", label: "2" },
  { id: "Digit3", label: "3" },
  { id: "Digit4", label: "4" },
  { id: "Digit5", label: "5" },
  { id: "Digit6", label: "6" },
  { id: "Digit7", label: "7" },
  { id: "Digit8", label: "8" },
  { id: "Digit9", label: "9" },
  { id: "Digit0", label: "0" },
  { id: "Minus", label: "-" },
  { id: "Equal", label: "=" },
  { id: "Backspace", label: "Backspace", width: 2 },
]

const QWERTY_ROW: RowKeySpec[] = [
  { id: "Tab", label: "Tab", width: 1.5 },
  ...[...letters].map((ch) => ({ id: `Key${ch}`, label: ch })),
  { id: "BracketLeft", label: "[" },
  { id: "BracketRight", label: "]" },
  { id: "Backslash", label: "\\", width: 1.5 },
]

const HOME_ROW: RowKeySpec[] = [
  { id: "CapsLock", label: "Caps Lock", width: 1.75 },
  ...[...homeLetters].map((ch) => ({ id: `Key${ch}`, label: ch })),
  { id: "Semicolon", label: ";" },
  { id: "Quote", label: "'" },
  { id: "Enter", label: "Enter", width: 2.25 },
]

const BOTTOM_ROW: RowKeySpec[] = [
  { id: "ShiftLeft", label: "Shift", width: 2.25 },
  ...[...bottomLetters].map((ch) => ({ id: `Key${ch}`, label: ch })),
  { id: "Comma", label: "," },
  { id: "Period", label: "." },
  { id: "Slash", label: "/" },
  { id: "ShiftRight", label: "Shift", width: 2.75 },
]

const SPACE_ROW: RowKeySpec[] = [
  { id: "ControlLeft", label: "Ctrl", width: 1.25 },
  { id: "MetaLeft", label: "Win", width: 1.25 },
  { id: "AltLeft", label: "Alt", width: 1.25 },
  { id: "Space", label: "Space", width: 6.25 },
  { id: "AltRight", label: "Alt", width: 1.25 },
  { id: "MetaRight", label: "Win", width: 1.25 },
  { id: "ContextMenu", label: "Menu", width: 1.25 },
  { id: "ControlRight", label: "Ctrl", width: 1.25 },
]

/**
 * Standard ANSI horizontal stagger, in u, relative to the number row's left
 * edge. Generic convention (seen in keyboard-layout-editor's default ANSI
 * template and most QMK layout diagrams) - physical row stagger is defined
 * for ergonomics, not derived from key widths, so these are independent
 * reference offsets rather than computed from the row tables above.
 */
const STAGGER = {
  function: 0,
  number: 0,
  qwerty: 0.5,
  home: 0.75,
  bottom: 1.25,
  space: 0,
} as const

/** Vertical gap between the function row and the number row, in u. */
const FUNCTION_ROW_GAP = 0.25
/** Horizontal gap between the alpha block and a side cluster (nav/arrows), in u. */
const CLUSTER_GAP = 0.5
/** Tighter horizontal gap used by 75%'s compact (gap-less) side column. */
const COMPACT_CLUSTER_GAP = 0.25

function buildRow(keys: RowKeySpec[], y: number, xOffset: number, row: number): KeyDef[] {
  let x = xOffset
  return keys.map((k) => {
    x += k.gapBefore ?? 0
    const width = k.width ?? 1
    const key: KeyDef = { id: k.id, label: k.label, x, y, width, height: 1, row }
    x += width
    return key
  })
}

function rowSpan(keys: RowKeySpec[]): number {
  return keys.reduce((sum, k) => sum + (k.gapBefore ?? 0) + (k.width ?? 1), 0)
}

interface AlphaBlock {
  keys: KeyDef[]
  rowY: { function?: number; number: number; qwerty: number; home: number; bottom: number; space: number }
  rowIndex: { function?: number; number: number; qwerty: number; home: number; bottom: number; space: number }
  width: number
}

/** Builds the shared alpha block (function row optional) all 4 layouts are made of. */
function buildAlphaBlock(hasFunctionRow: boolean): AlphaBlock {
  const keys: KeyDef[] = []
  let y = 0
  let rowCounter = 0
  const rowY: AlphaBlock["rowY"] = { number: 0, qwerty: 0, home: 0, bottom: 0, space: 0 }
  const rowIndex: AlphaBlock["rowIndex"] = { number: 0, qwerty: 0, home: 0, bottom: 0, space: 0 }

  if (hasFunctionRow) {
    rowY.function = y
    rowIndex.function = rowCounter
    keys.push(...buildRow(FUNCTION_ROW, y, STAGGER.function, rowCounter))
    rowCounter += 1
    y += 1 + FUNCTION_ROW_GAP
  }

  rowY.number = y
  rowIndex.number = rowCounter
  keys.push(...buildRow(NUMBER_ROW, y, STAGGER.number, rowCounter))
  rowCounter += 1
  y += 1

  rowY.qwerty = y
  rowIndex.qwerty = rowCounter
  keys.push(...buildRow(QWERTY_ROW, y, STAGGER.qwerty, rowCounter))
  rowCounter += 1
  y += 1

  rowY.home = y
  rowIndex.home = rowCounter
  keys.push(...buildRow(HOME_ROW, y, STAGGER.home, rowCounter))
  rowCounter += 1
  y += 1

  rowY.bottom = y
  rowIndex.bottom = rowCounter
  keys.push(...buildRow(BOTTOM_ROW, y, STAGGER.bottom, rowCounter))
  rowCounter += 1
  y += 1

  rowY.space = y
  rowIndex.space = rowCounter
  keys.push(...buildRow(SPACE_ROW, y, STAGGER.space, rowCounter))

  const width = Math.max(
    STAGGER.number + rowSpan(NUMBER_ROW),
    STAGGER.qwerty + rowSpan(QWERTY_ROW),
    STAGGER.home + rowSpan(HOME_ROW),
    STAGGER.bottom + rowSpan(BOTTOM_ROW),
    STAGGER.space + rowSpan(SPACE_ROW),
  )

  return { keys, rowY, rowIndex, width }
}

/** Inverted-T arrow cluster (3 cols x 2 rows), anchored to the bottom two alpha rows. */
function buildArrowCluster(x: number, upperY: number, lowerY: number, upperRow: number, lowerRow: number): KeyDef[] {
  return [
    { id: "ArrowUp", label: "Up", x: x + 1, y: upperY, width: 1, height: 1, row: upperRow },
    { id: "ArrowLeft", label: "Left", x, y: lowerY, width: 1, height: 1, row: lowerRow },
    { id: "ArrowDown", label: "Down", x: x + 1, y: lowerY, width: 1, height: 1, row: lowerRow },
    { id: "ArrowRight", label: "Right", x: x + 2, y: lowerY, width: 1, height: 1, row: lowerRow },
  ]
}

// ---------------------------------------------------------------------------
// Layout builders
// ---------------------------------------------------------------------------

/** 60%: alpha block only - no function row, no nav/arrow clusters. */
function build60(): KeyDef[] {
  return buildAlphaBlock(false).keys
}

/**
 * 65%: 60% + a compact nav column (Delete/Home/End) over the top three alpha
 * rows, plus an arrow cluster under the bottom two alpha rows. No function
 * row - this is the standard distinguishing trait of a 65% layout.
 */
function build65(): KeyDef[] {
  const alpha = buildAlphaBlock(false)
  const navX = alpha.width + CLUSTER_GAP
  const nav: KeyDef[] = [
    { id: "Delete", label: "Del", x: navX, y: alpha.rowY.number, width: 1, height: 1, row: alpha.rowIndex.number },
    { id: "Home", label: "Home", x: navX, y: alpha.rowY.qwerty, width: 1, height: 1, row: alpha.rowIndex.qwerty },
    { id: "End", label: "End", x: navX, y: alpha.rowY.home, width: 1, height: 1, row: alpha.rowIndex.home },
  ]
  const arrowX = navX
  const arrows = buildArrowCluster(
    arrowX,
    alpha.rowY.bottom,
    alpha.rowY.space,
    alpha.rowIndex.bottom,
    alpha.rowIndex.space,
  )
  return [...alpha.keys, ...nav, ...arrows]
}

/**
 * 75%: full function row + alpha block, with a tight (gap-less) single-column
 * nav strip (PrtSc/Del/Home/End) and an adjacent arrow cluster. The hallmark
 * of a 75% vs. a TKL is this tight packing - no breathing room between
 * blocks - rather than any key being removed.
 */
function build75(): KeyDef[] {
  const alpha = buildAlphaBlock(true)
  const navX = alpha.width + COMPACT_CLUSTER_GAP
  const nav: KeyDef[] = [
    {
      id: "PrintScreen",
      label: "PrtSc",
      x: navX,
      y: alpha.rowY.function as number,
      width: 1,
      height: 1,
      row: alpha.rowIndex.function as number,
    },
    { id: "Delete", label: "Del", x: navX, y: alpha.rowY.number, width: 1, height: 1, row: alpha.rowIndex.number },
    { id: "Home", label: "Home", x: navX, y: alpha.rowY.qwerty, width: 1, height: 1, row: alpha.rowIndex.qwerty },
    { id: "End", label: "End", x: navX, y: alpha.rowY.home, width: 1, height: 1, row: alpha.rowIndex.home },
  ]
  const arrowX = navX
  const arrows = buildArrowCluster(
    arrowX,
    alpha.rowY.bottom,
    alpha.rowY.space,
    alpha.rowIndex.bottom,
    alpha.rowIndex.space,
  )
  return [...alpha.keys, ...nav, ...arrows]
}

/**
 * TKL (Tenkeyless): full function row + alpha block + a proper 2x3 nav block
 * (Insert/Home/PageUp, Delete/End/PageDown) with real breathing-room gaps on
 * both sides, plus the arrow cluster. Same keyset as 75%, generously spaced.
 */
function buildTkl(): KeyDef[] {
  const alpha = buildAlphaBlock(true)
  const navX = alpha.width + CLUSTER_GAP
  const navTopY = alpha.rowY.number
  const navBottomY = alpha.rowY.qwerty
  const nav: KeyDef[] = [
    { id: "Insert", label: "Ins", x: navX, y: navTopY, width: 1, height: 1, row: alpha.rowIndex.number },
    { id: "Home", label: "Home", x: navX + 1, y: navTopY, width: 1, height: 1, row: alpha.rowIndex.number },
    { id: "PageUp", label: "PgUp", x: navX + 2, y: navTopY, width: 1, height: 1, row: alpha.rowIndex.number },
    { id: "Delete", label: "Del", x: navX, y: navBottomY, width: 1, height: 1, row: alpha.rowIndex.qwerty },
    { id: "End", label: "End", x: navX + 1, y: navBottomY, width: 1, height: 1, row: alpha.rowIndex.qwerty },
    { id: "PageDown", label: "PgDn", x: navX + 2, y: navBottomY, width: 1, height: 1, row: alpha.rowIndex.qwerty },
  ]
  const arrowX = navX + CLUSTER_GAP
  const arrows = buildArrowCluster(
    arrowX,
    alpha.rowY.bottom,
    alpha.rowY.space,
    alpha.rowIndex.bottom,
    alpha.rowIndex.space,
  )
  return [...alpha.keys, ...nav, ...arrows]
}

export const KEYBOARD_LAYOUTS: Record<KeyboardLayoutId, KeyboardLayoutDef> = {
  "60": { id: "60", label: "60%", keys: build60() },
  "65": { id: "65", label: "65%", keys: build65() },
  "75": { id: "75", label: "75%", keys: build75() },
  tkl: { id: "tkl", label: "TKL", keys: buildTkl() },
}

export const KEYBOARD_LAYOUT_IDS: KeyboardLayoutId[] = ["60", "65", "75", "tkl"]

/** Bounding box of a key set, in u. Used by `<Case>` to size the shell to the active layout. */
export function getLayoutBounds(keys: KeyDef[]): { width: number; depth: number } {
  let maxX = 0
  let maxY = 0
  for (const k of keys) {
    maxX = Math.max(maxX, k.x + k.width)
    maxY = Math.max(maxY, k.y + k.height)
  }
  return { width: maxX, depth: maxY }
}
