import {ROW, COLUMN, COLUMN_GAP, STUB, PT, CM, FONT, CLASSICAL_GAP} from './catalog.mjs'
import {spanOf} from './model.mjs'

// Typeset label sizes, filled in as MathJax renders them. Until then a rough
// estimate keeps the layout stable.
const measured = new Map()
const labelKey = (value, size) => `${Math.round(size * 10)}|${value}`
export function remember(value, size, box) {
  const id = labelKey(value, size),
    previous = measured.get(id)
  measured.set(id, box)
  return !previous || Math.abs(previous.width - box.width) > 0.5
}
export function measure(value, size = FONT) {
  if (!value || !value.trim()) return {width: 0, height: 0}
  const known = measured.get(labelKey(value, size))
  if (known) return known
  const glyphs = value
    .replace(/\\(left|right|middle|big|Big|bigg|Bigg|[,;:! ])/g, '')
    .replace(/\\[a-zA-Z]+/g, 'x')
    .replace(/[{}_^\s]/g, '')
  return {width: Math.max(1, glyphs.length) * size * 0.55, height: size * 0.75}
}

const INNER = 8 * PT // \gate keeps 4pt around its label on every side
export const DOT = 0.06 * CM // control and phase dots
export const TARGET = 9.5
export const METER = {width: 20 * PT, height: 15 * PT}
export const TRASH = {width: 20 * PT, height: 25 * PT}

// Size of an element's body, and how far it interrupts the wire on either side.
export function shape(i) {
  const label = measure(i.value)
  switch (i.kind) {
    case 'gate': {
      const width = label.width + INNER,
        height = Math.max(INNER, label.height + INNER)
      return {width, height, left: width / 2, right: width / 2}
    }
    case 'meter': {
      if (i.variant === 'measure' || i.variant === 'meterD') {
        const height = label.height + INNER,
          width = Math.max(height, label.width + INNER + (i.variant === 'meterD' ? 1 : 0))
        return {width, height, left: width / 2, right: width / 2}
      }
      if (i.variant === 'measuretab') {
        const height = Math.max(FONT, label.height + INNER),
          width = Math.max(METER.width, label.width + INNER + height / 2)
        return {width, height, left: width / 2, right: width / 2}
      }
      return {...METER, left: METER.width / 2, right: METER.width / 2}
    }
    case 'push':
      return {
        width: label.width,
        height: label.height,
        left: label.width / 2,
        right: label.width / 2,
      }
    case 'ground':
      return {width: 5 * CLASSICAL_GAP, height: 8 * CLASSICAL_GAP, left: 3.9, right: 4.8}
    case 'trash':
      return {...TRASH, left: TRASH.width / 2, right: TRASH.width / 2}
    case 'targ':
      return {width: 2 * TARGET, height: 2 * TARGET, left: 0, right: 0}
    case 'swap':
      return {width: 15, height: 13.2, left: 0, right: 0}
    case 'bundle':
      return {width: 10.2, height: 15.4, left: 0, right: 0}
    default:
      return {width: 2 * DOT, height: 2 * DOT, left: 0, right: 0}
  }
}
// Vertical extent of an element, relative to the centre of its first wire.
export function verticalExtent(i) {
  const s = shape(i)
  return {top: -s.height / 2, bottom: (spanOf(i) - 1) * ROW + s.height / 2}
}

export function layout(circuit) {
  const c = circuit
  const widths = Array(c.cols).fill(COLUMN)
  const shapes = new Map()
  for (const i of c.items) {
    const s = shape(i)
    shapes.set(i.id, s)
    if (i.col >= 0 && i.col < c.cols)
      widths[i.col] = Math.max(widths[i.col], Math.ceil(s.width + COLUMN_GAP))
  }
  const edges = [0]
  for (const w of widths) edges.push(edges.at(-1) + w)
  const right = edges.at(-1)
  // Steps beyond the circuit continue at the narrowest width.
  const boundary = (k) =>
    k <= 0 ? k * COLUMN : k >= c.cols ? right + (k - c.cols) * COLUMN : edges[k]
  const center = (col) => (boundary(col) + boundary(col + 1)) / 2
  const columnAt = (x) => {
    if (x < 0) return Math.floor(x / COLUMN)
    if (x >= right) return c.cols + Math.floor((x - right) / COLUMN)
    let k = 0
    while (k < c.cols - 1 && edges[k + 1] <= x) k++
    return k
  }
  const occupants = new Map()
  for (const i of c.items)
    for (let r = i.row; r < i.row + spanOf(i); r++) occupants.set(`${r}:${i.col}`, i)
  const at = (row, col) => occupants.get(`${row}:${col}`)
  return {
    rows: c.rows,
    cols: c.cols,
    boundary,
    center,
    columnAt,
    rowAt: (y) => Math.round(y / ROW),
    y: (row) => row * ROW,
    wireStart: -STUB,
    wireEnd: right + STUB,
    right,
    at,
    shape: (i) => shapes.get(i.id) || shape(i),
    // Where a wire leaves the element in a cell, and where it enters the next.
    exit: (row, col) => {
      const i = at(row, col)
      return center(col) + (i ? (shapes.get(i.id) || shape(i)).right : 0)
    },
    entry: (row, col) => {
      const i = at(row, col)
      return center(col) - (i ? (shapes.get(i.id) || shape(i)).left : 0)
    },
    // The segment of a wire nearest to an x position: k runs into step k.
    segmentAt: (x) => {
      const col = columnAt(x)
      return x < center(col) ? col : col + 1
    },
  }
}

// Extent of everything drawn, for fitting the view and exporting.
export function bounds(circuit, L = layout(circuit), padding = 0) {
  const c = circuit
  let left = L.wireStart,
    right = L.wireEnd,
    top = -ROW / 2,
    bottom = Math.max(0, c.rows - 1) * ROW + ROW / 2
  c.wires.forEach((w) => {
    if (w.input) left = Math.min(left, L.wireStart - 20 - measure(w.input).width)
    if (w.output) right = Math.max(right, L.wireEnd + 20 + measure(w.output).width)
  })
  if (c.slices.length || c.groups.length) top -= 1.2 * FONT
  if (c.items.some((i) => i.kind === 'trash')) bottom += 1.2 * FONT
  return {
    x: left - padding,
    y: top - padding,
    width: right - left + 2 * padding,
    height: bottom - top + 2 * padding,
  }
}
