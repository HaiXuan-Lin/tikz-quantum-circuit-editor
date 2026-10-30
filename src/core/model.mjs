import {kinds, spans, defaultLabels, meterStyles, wireTypeIDs} from './catalog.mjs'

let sequence = 0
export const uid = (prefix) =>
  `${prefix}${Date.now().toString(36)}${(++sequence).toString(36)}`
export const clone = (value) => JSON.parse(JSON.stringify(value))
const range = (from, to) =>
  Array.from({length: Math.max(0, to - from)}, (_, i) => from + i)

// A circuit is the quantikz matrix: `rows` wires and `cols` steps between the
// input column (\lstick) and the output column (\rstick).
export const wire = (cols, type = 'q') => ({
  input: '',
  inputSpan: 1,
  output: '',
  outputSpan: 1,
  // segments[k] is the wire running into step k; the last one runs to the output.
  segments: Array(cols + 1).fill(type),
})
export const emptyCircuit = (rows = 3, cols = 6) => ({
  version: 1,
  title: 'Untitled circuit',
  rows,
  cols,
  wires: range(0, rows).map(() => wire(cols)),
  items: [],
  slices: [],
  groups: [],
  options: {rowSep: null, columnSep: null, thinLines: false},
})
export const item = (kind, row, col, props = {}) => ({
  id: uid('g'),
  kind,
  row,
  col,
  value: defaultLabels[kind] ?? '',
  span: 1,
  // Rows to the far end of this element's vertical wire; 0 for none.
  link: 0,
  linkType: 'q',
  variant: kind === 'meter' ? 'meter' : null,
  ...props,
})
// A slice sits between step `col` and step `col + 1`; -1 is before the first step.
export const slice = (col, value = '') => ({id: uid('s'), col, value})
export const group = (row, col, rows = 1, cols = 1, props = {}) => ({
  id: uid('b'),
  row,
  col,
  rows,
  cols,
  value: '',
  dashed: true,
  ...props,
})

export const key = (kind, id) => `${kind}:${id}`
export const selected = (selection, kind, id) => selection.includes(key(kind, id))
export const cellKey = (row, col) => key('cell', `${row}:${col}`)
export function splitKey(value) {
  const i = value.indexOf(':')
  return [value.slice(0, i), value.slice(i + 1)]
}
export const selectedCell = (selection) => {
  if (selection.length !== 1 || !selection[0].startsWith('cell:')) return null
  const [row, col] = splitKey(selection[0])[1].split(':').map(Number)
  return {row, col}
}
export const allKeys = (c) => [
  ...c.items.map((i) => key('item', i.id)),
  ...c.slices.map((s) => key('slice', s.id)),
  ...c.groups.map((g) => key('group', g.id)),
]

export const spanOf = (i) => (spans(i) ? i.span : 1)
export const covers = (i, row, col) =>
  i.col === col && row >= i.row && row < i.row + spanOf(i)
export const occupant = (c, row, col) => c.items.find((i) => covers(i, row, col))
const overlaps = (a, b) =>
  a.col === b.col && a.row < b.row + spanOf(b) && b.row < a.row + spanOf(a)

function extent(c) {
  let top = 0,
    left = 0,
    bottom = c.rows - 1,
    right = c.cols - 1
  for (const i of c.items) {
    top = Math.min(top, i.row, i.row + i.link)
    bottom = Math.max(bottom, i.row + spanOf(i) - 1, i.row + i.link)
    left = Math.min(left, i.col)
    right = Math.max(right, i.col)
  }
  for (const g of c.groups) {
    top = Math.min(top, g.row)
    bottom = Math.max(bottom, g.row + g.rows - 1)
    left = Math.min(left, g.col)
    right = Math.max(right, g.col + g.cols - 1)
  }
  for (const s of c.slices) {
    left = Math.min(left, s.col + 1)
    right = Math.max(right, s.col)
  }
  return {top, left, bottom, right}
}

// Grows the matrix so that everything placed lies on it. Content dropped above
// or left of the circuit prepends wires or steps.
export function normalize(c) {
  const e = extent(c),
    top = -e.top,
    left = -e.left
  let next = c
  if (top || left)
    next = {
      ...c,
      rows: c.rows + top,
      cols: c.cols + left,
      wires: [
        ...range(0, top).map(() => wire(c.cols + left)),
        ...c.wires.map((w) => ({
          ...w,
          segments: [...Array(left).fill(w.segments[0]), ...w.segments],
        })),
      ],
      items: c.items.map((i) => ({...i, row: i.row + top, col: i.col + left})),
      slices: c.slices.map((s) => ({...s, col: s.col + left})),
      groups: c.groups.map((g) => ({...g, row: g.row + top, col: g.col + left})),
    }
  const rows = Math.max(next.rows, e.bottom + top + 1),
    cols = Math.max(next.cols, e.right + left + 1)
  if (rows === next.rows && cols === next.cols) return next
  return {
    ...next,
    rows,
    cols,
    wires: [
      ...next.wires.map((w) => ({
        ...w,
        segments: [
          ...w.segments,
          ...Array(cols - next.cols).fill(w.segments[w.segments.length - 1]),
        ],
      })),
      ...range(next.rows, rows).map(() => wire(cols)),
    ],
  }
}

// New elements replace whatever already occupies their cells.
export function place(c, element) {
  return normalize({
    ...c,
    items: [
      ...c.items.filter((i) => i.id !== element.id && !overlaps(i, element)),
      element,
    ],
  })
}

export function updateItem(c, id, changes) {
  const current = c.items.find((i) => i.id === id)
  if (!current) return c
  const next = {...current, ...changes}
  if (next.span !== current.span || next.row !== current.row || next.col !== current.col)
    return place(c, next)
  return normalize({...c, items: c.items.map((i) => (i.id === id ? next : i))})
}

// Rows inserted at `at` push content down; elements and vertical wires that
// straddle the new row stretch over it.
export function insertRow(c, at) {
  const shift = (r) => (r >= at ? r + 1 : r),
    stretch = (r, span) => (r < at && r + span - 1 >= at ? span + 1 : span)
  const wires = c.wires.map((w, r) => ({
    ...w,
    inputSpan: stretch(r, w.inputSpan),
    outputSpan: stretch(r, w.outputSpan),
  }))
  wires.splice(at, 0, wire(c.cols))
  return {
    ...c,
    rows: c.rows + 1,
    wires,
    items: c.items.map((i) => {
      const row = shift(i.row),
        straddles = i.row < at && i.row + spanOf(i) - 1 >= at
      return {
        ...i,
        row,
        span: spans(i) && straddles ? i.span + 1 : i.span,
        link: i.link ? shift(i.row + i.link) - row : 0,
      }
    }),
    groups: c.groups.map((g) => ({
      ...g,
      row: shift(g.row),
      rows: g.row < at && g.row + g.rows - 1 >= at ? g.rows + 1 : g.rows,
    })),
  }
}

export function deleteRow(c, at) {
  if (c.rows <= 1) return c
  const shift = (r) => (r > at ? r - 1 : r)
  const shrink = (start, span) =>
    start <= at && at < start + span ? Math.max(1, span - 1) : span
  const items = []
  for (const i of c.items) {
    const span = spanOf(i)
    if (i.row === at && span === 1) continue
    const row = shift(i.row)
    let end = i.row + i.link
    // A vertical wire ending on the deleted row now stops one row short.
    if (end === at && i.link > 0) end -= 1
    end = shift(end)
    items.push({
      ...i,
      row,
      span: spans(i) ? shrink(i.row, span) : i.span,
      link: i.link ? end - row : 0,
    })
  }
  const wires = c.wires.map((w, r) => ({
    ...w,
    inputSpan: shrink(r, w.inputSpan),
    outputSpan: shrink(r, w.outputSpan),
  }))
  // A label on the deleted wire passes to the next wire it spans.
  const removed = c.wires[at],
    following = wires[at + 1]
  if (following) {
    if (removed.inputSpan > 1 && !following.input)
      wires[at + 1] = {
        ...wires[at + 1],
        input: removed.input,
        inputSpan: removed.inputSpan - 1,
      }
    if (removed.outputSpan > 1 && !following.output)
      wires[at + 1] = {
        ...wires[at + 1],
        output: removed.output,
        outputSpan: removed.outputSpan - 1,
      }
  }
  wires.splice(at, 1)
  return {
    ...c,
    rows: c.rows - 1,
    wires: wires.map((w, r) => ({
      ...w,
      inputSpan: Math.min(w.inputSpan, c.rows - 1 - r),
      outputSpan: Math.min(w.outputSpan, c.rows - 1 - r),
    })),
    items,
    groups: c.groups
      .filter((g) => !(g.row === at && g.rows === 1))
      .map((g) => ({...g, row: shift(g.row), rows: shrink(g.row, g.rows)})),
  }
}

export function insertColumn(c, at) {
  return {
    ...c,
    cols: c.cols + 1,
    wires: c.wires.map((w) => {
      const segments = [...w.segments]
      segments.splice(at, 0, segments[Math.min(at, segments.length - 1)])
      return {...w, segments}
    }),
    items: c.items.map((i) => (i.col >= at ? {...i, col: i.col + 1} : i)),
    slices: c.slices.map((s) => (s.col >= at ? {...s, col: s.col + 1} : s)),
    groups: c.groups.map((g) =>
      g.col >= at
        ? {...g, col: g.col + 1}
        : g.col + g.cols - 1 >= at
          ? {...g, cols: g.cols + 1}
          : g,
    ),
  }
}

export function deleteColumn(c, at) {
  if (c.cols <= 1) return c
  const slices = []
  for (const s of c.slices) {
    const col = s.col >= at ? s.col - 1 : s.col
    if (!slices.some((other) => other.col === col)) slices.push({...s, col})
  }
  return {
    ...c,
    cols: c.cols - 1,
    wires: c.wires.map((w) => {
      const segments = [...w.segments]
      segments.splice(at + 1, 1)
      return {...w, segments}
    }),
    items: c.items
      .filter((i) => i.col !== at)
      .map((i) => (i.col > at ? {...i, col: i.col - 1} : i)),
    slices,
    groups: c.groups
      .filter((g) => !(g.col === at && g.cols === 1))
      .map((g) =>
        g.col > at
          ? {...g, col: g.col - 1}
          : g.col + g.cols - 1 >= at
            ? {...g, cols: g.cols - 1}
            : g,
      ),
  }
}

export function resize(c, rows, cols) {
  let next = c
  while (next.rows < rows) next = insertRow(next, next.rows)
  while (next.rows > Math.max(1, rows)) next = deleteRow(next, next.rows - 1)
  while (next.cols < cols) next = insertColumn(next, next.cols)
  while (next.cols > Math.max(1, cols)) next = deleteColumn(next, next.cols - 1)
  return next
}

export function setSegments(c, row, from, to, type) {
  if (!c.wires[row]) return c
  const [a, b] = [Math.min(from, to), Math.max(from, to)]
  return {
    ...c,
    wires: c.wires.map((w, r) =>
      r === row
        ? {...w, segments: w.segments.map((t, k) => (k >= a && k <= b ? type : t))}
        : w,
    ),
  }
}
// Like \setwiretype: changes the stretch of wire that starts at segment k.
export function setWireFrom(c, row, k, type) {
  const segments = c.wires[row]?.segments
  if (!segments) return c
  let end = k
  while (end + 1 < segments.length && segments[end + 1] === segments[k]) end++
  return setSegments(c, row, k, end, type)
}

export function removeSelection(c, selection) {
  const has = (kind, id) => selected(selection, kind, id)
  return {
    ...c,
    wires: c.wires.map((w, r) => ({
      ...w,
      ...(has('input', r) ? {input: '', inputSpan: 1} : {}),
      ...(has('output', r) ? {output: '', outputSpan: 1} : {}),
    })),
    items: c.items.filter((i) => !has('item', i.id)),
    slices: c.slices.filter((s) => !has('slice', s.id)),
    groups: c.groups.filter((g) => !has('group', g.id)),
  }
}

// Moves selected content by whole cells, or returns null if it would land on
// something that stays behind.
export function moveSelection(c, selection, rows, cols) {
  const moving = (i) => selected(selection, 'item', i.id)
  const moved = c.items
    .filter(moving)
    .map((i) => ({...i, row: i.row + rows, col: i.col + cols}))
  const staying = c.items.filter((i) => !moving(i))
  if (moved.some((a) => a.row < 0 || a.col < 0 || a.row + a.link < 0)) return null
  if (moved.some((a) => staying.some((b) => overlaps(a, b)))) return null
  const slices = c.slices.map((s) =>
    selected(selection, 'slice', s.id) ? {...s, col: s.col + cols} : s,
  )
  if (
    slices.some((s, i) => s.col < -1 || slices.some((t, j) => j < i && t.col === s.col))
  )
    return null
  const groups = c.groups.map((g) =>
    selected(selection, 'group', g.id) ? {...g, row: g.row + rows, col: g.col + cols} : g,
  )
  if (groups.some((g) => g.row < 0 || g.col < 0)) return null
  return normalize({...c, items: [...staying, ...moved], slices, groups})
}

// Copies the selected steps into fresh columns straight after them.
export function duplicateSelection(c, selection) {
  const items = c.items.filter((i) => selected(selection, 'item', i.id)),
    groups = c.groups.filter((g) => selected(selection, 'group', g.id))
  if (!items.length && !groups.length) return {circuit: c, selection}
  const first = Math.min(...items.map((i) => i.col), ...groups.map((g) => g.col)),
    last = Math.max(...items.map((i) => i.col), ...groups.map((g) => g.col + g.cols - 1)),
    width = last - first + 1
  let next = c
  for (let k = 0; k < width; k++) next = insertColumn(next, last + 1)
  const copies = items.map((i) => ({...clone(i), id: uid('g'), col: i.col + width})),
    boxes = groups.map((g) => ({...clone(g), id: uid('b'), col: g.col + width}))
  return {
    circuit: {
      ...next,
      items: [...next.items, ...copies],
      groups: [...next.groups, ...boxes],
    },
    selection: [
      ...copies.map((i) => key('item', i.id)),
      ...boxes.map((g) => key('group', g.id)),
    ],
  }
}

const integer = (value, fallback, min, max) =>
  Number.isFinite(Number(value))
    ? Math.max(min, Math.min(max, Math.round(Number(value))))
    : fallback
const text = (value) => (typeof value === 'string' ? value.slice(0, 2000) : '')
const length = (value) =>
  value == null || value === '' || !Number.isFinite(Number(value))
    ? null
    : Math.max(0, Math.min(10, Number(value)))

// Saved files and share links enter through this validation boundary.
export function parseCircuit(input) {
  const source = typeof input === 'string' ? JSON.parse(input) : input
  if (!source || typeof source !== 'object' || !Array.isArray(source.items))
    throw new Error('A circuit needs wires and items.')
  const rows = integer(source.rows, NaN, 0, 200),
    cols = integer(source.cols, NaN, 1, 500)
  if (!Number.isInteger(rows) || !Number.isInteger(cols))
    throw new Error('The numbers of wires and steps are invalid.')
  if (source.items.length > 20000) throw new Error('The circuit is too large.')
  const ids = new Set()
  const identity = (value, prefix) => {
    const id =
      typeof value === 'string' && /^[\w-]{1,40}$/.test(value) && !ids.has(value)
        ? value
        : uid(prefix)
    ids.add(id)
    return id
  }
  const wires = range(0, rows).map((r) => {
    const w = (Array.isArray(source.wires) && source.wires[r]) || {}
    const segments = range(0, cols + 1).map((k) =>
      wireTypeIDs.includes(w.segments?.[k]) ? w.segments[k] : 'q',
    )
    return {
      input: text(w.input),
      inputSpan: integer(w.inputSpan, 1, 1, rows - r),
      output: text(w.output),
      outputSpan: integer(w.outputSpan, 1, 1, rows - r),
      segments,
    }
  })
  const items = []
  for (const i of source.items) {
    if (!i || !kinds.includes(i.kind)) continue
    const row = integer(i.row, -1, -1, rows),
      col = integer(i.col, -1, -1, cols)
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue
    const variant =
      i.kind === 'meter'
        ? meterStyles.some((m) => m.id === i.variant)
          ? i.variant
          : 'meter'
        : null
    const next = {
      id: identity(i.id, 'g'),
      kind: i.kind,
      row,
      col,
      value: text(i.value),
      span: spans({kind: i.kind, variant}) ? integer(i.span, 1, 1, rows - row) : 1,
      link: integer(i.link, 0, -row, rows - 1 - row),
      linkType: i.linkType === 'c' ? 'c' : 'q',
      variant,
    }
    if (!items.some((other) => overlaps(other, next))) items.push(next)
  }
  const slices = []
  for (const s of Array.isArray(source.slices) ? source.slices : []) {
    const col = integer(s?.col, -2, -2, cols)
    if (col >= -1 && col < cols && !slices.some((other) => other.col === col))
      slices.push({id: identity(s.id, 's'), col, value: text(s.value)})
  }
  const groups = []
  for (const g of Array.isArray(source.groups) ? source.groups : []) {
    if (!g) continue
    const row = integer(g.row, -1, -1, rows),
      col = integer(g.col, -1, -1, cols)
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue
    groups.push({
      id: identity(g.id, 'b'),
      row,
      col,
      rows: integer(g.rows, 1, 1, rows - row),
      cols: integer(g.cols, 1, 1, cols - col),
      value: text(g.value),
      dashed: g.dashed !== false,
    })
  }
  const options = source.options || {}
  return {
    version: 1,
    title: text(source.title).slice(0, 200) || 'Untitled circuit',
    rows,
    cols,
    wires,
    items,
    slices,
    groups,
    options: {
      rowSep: length(options.rowSep),
      columnSep: length(options.columnSep),
      thinLines: options.thinLines === true,
    },
  }
}

export class History {
  constructor(initial, limit = 100) {
    this.entries = [clone(initial)]
    this.index = 0
    this.limit = limit
  }
  push(document) {
    if (JSON.stringify(document) === JSON.stringify(this.entries[this.index])) return
    this.entries = this.entries.slice(0, this.index + 1)
    this.entries.push(clone(document))
    if (this.entries.length > this.limit) this.entries.shift()
    this.index = this.entries.length - 1
  }
  undo() {
    if (this.index > 0) this.index--
    return clone(this.entries[this.index])
  }
  redo() {
    if (this.index < this.entries.length - 1) this.index++
    return clone(this.entries[this.index])
  }
  get canUndo() {
    return this.index > 0
  }
  get canRedo() {
    return this.index < this.entries.length - 1
  }
}
