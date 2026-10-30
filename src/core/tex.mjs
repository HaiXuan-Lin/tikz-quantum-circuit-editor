import {meterStyles, wireTypeIDs} from './catalog.mjs'
import {spanOf, parseCircuit, emptyCircuit, item, slice, group} from './model.mjs'

export const PREAMBLE = '\\usepackage{tikz}\n\\usetikzlibrary{quantikz2}'

const number = (value) => Number(Number(value).toFixed(3))
const balanced = (value) => {
  let depth = 0
  for (const c of value) {
    depth += c === '{' ? 1 : c === '}' ? -1 : 0
    if (depth < 0) return false
  }
  return depth === 0
}

// Labels are TeX math throughout the editor. \lstick, \rstick, \slice and
// \gategroup typeset text, so their math is wrapped in $…$, except for forms
// that read the same in text mode.
export function textArgument(value) {
  const v = value.trim()
  if (!v) return ''
  const text = v.match(/^\\text\{(.*)\}$/s)
  if (text && balanced(text[1])) return text[1]
  if (
    /^\\(ket|bra|proj)\{[^{}$]*\}$/.test(v) ||
    /^\\braket\{[^{}$]*\}\{[^{}$]*\}$/.test(v)
  )
    return v
  return '$' + v + '$'
}
function fromTextArgument(value) {
  const v = value.trim()
  if (!v) return ''
  if (/^\$[^$]*\$$/.test(v)) return v.slice(1, -1).trim()
  // Without $…$, commands and scripts can only be meant as math; words are text.
  if (!v.includes('$') && /\\[a-zA-Z]|[\^_]/.test(v)) return v
  return '\\text{' + v + '}'
}

const options = (...list) => {
  const present = list.filter((x) => x != null && x !== '')
  return present.length ? '[' + present.join(',') + ']' : ''
}
const ownsLink = (i) => ['ctrl', 'octrl', 'swap'].includes(i.kind)

// Trims a label without breaking a final control space such as `\ `.
const trim = (value) => value.trim() + (/\\\s+$/.test(value) ? ' ' : '')

export function command(i) {
  const v = trim(i.value),
    wires = spanOf(i) > 1 ? i.span : null,
    vertical = i.link && i.linkType === 'c' ? 'vertical wire=c' : null
  switch (i.kind) {
    case 'gate':
      return `\\gate${options(wires)}{${v}}`
    case 'meter':
      return `\\${i.variant || 'meter'}${options(wires)}{${v}}`
    case 'ctrl':
      return i.link ? `\\ctrl${options(vertical)}{${i.link}}` : '\\control{}'
    case 'octrl':
      return i.link ? `\\octrl${options(vertical)}{${i.link}}` : '\\ocontrol{}'
    case 'swap':
      return i.link ? `\\swap${options(vertical)}{${i.link}}` : '\\targX{}'
    case 'targ':
      return '\\targ{}'
    case 'phase':
      return `\\phase{${v}}`
    case 'ground':
      return '\\ground{}'
    case 'trash':
      return `\\trash{${v}}`
    case 'push':
      return `\\push{${v}}`
    case 'bundle':
      return `\\qwbundle{${v}}`
  }
  return ''
}
// Elements other than controls and swaps draw their vertical wire with \wire.
const verticalWire = (i) =>
  !i.link || ownsLink(i)
    ? ''
    : `\\wire[${i.link > 0 ? 'd' : 'u'}][${Math.abs(i.link)}]{${i.linkType}}`

export function toTeX(circuit, {standalone = false, shareURL = ''} = {}) {
  const c = circuit,
    width = c.cols + 2
  // The quantikz matrix: an input column, one column per step, an output column.
  const cells = c.wires.map(() => Array.from({length: width}, () => []))
  c.wires.forEach((w, r) => {
    if (w.input.trim())
      cells[r][0].push(
        `\\lstick${options(w.inputSpan > 1 ? w.inputSpan : null)}{${textArgument(w.input)}}`,
      )
    if (w.output.trim())
      cells[r][width - 1].push(
        `\\rstick${options(w.outputSpan > 1 ? w.outputSpan : null)}{${textArgument(w.output)}}`,
      )
  })
  // Gate commands come first in their cell, as quantikz requires.
  for (const i of c.items) cells[i.row][i.col + 1].unshift(command(i) + verticalWire(i))
  c.wires.forEach((w, r) => {
    // \setwiretype in a cell changes the wire running into that cell and on.
    for (let k = 1; k <= c.cols; k++)
      if (w.segments[k] !== w.segments[k - 1])
        cells[r][k + 1].push(`\\setwiretype{${w.segments[k]}}`)
  })
  if (c.rows)
    for (const s of [...c.slices].sort((a, b) => a.col - b.col))
      cells[0][s.col + 1].push(`\\slice{${textArgument(s.value)}}`)
  for (const g of c.groups)
    cells[g.row][g.col + 1].push(
      `\\gategroup${options(
        g.rows,
        g.cols > 1 ? `steps=${g.cols}` : null,
        g.dashed ? 'style={dashed,rounded corners}' : null,
        'background',
      )}{${textArgument(g.value)}}`,
    )

  const environment = []
  if (c.wires.some((w) => w.segments[0] !== 'q'))
    environment.push(`wire types={${c.wires.map((w) => w.segments[0]).join(',')}}`)
  if (c.options.rowSep != null)
    environment.push(`row sep={${number(c.options.rowSep)}cm,between origins}`)
  if (c.options.columnSep != null)
    environment.push(`column sep=${number(c.options.columnSep)}cm`)
  if (c.options.thinLines) environment.push('thin lines')

  // Align the columns of the source, as one would by hand.
  const text = cells.map((row) => row.map((cell) => cell.join('')))
  const widths = Array.from({length: width}, (_, m) =>
    Math.min(40, Math.max(0, ...text.map((row) => row[m].length))),
  )
  const lines = text.map((row, r) => {
    // Columns that are empty in every row collapse to a bare `&`.
    let line = row[0].padEnd(widths[0])
    for (let m = 1; m < width; m++)
      line += widths[m]
        ? ' & ' + (m === width - 1 ? row[m] : row[m].padEnd(widths[m]))
        : ' &'
    // Without input labels, rows start at their first `&`.
    line = line.trimEnd()
    return (widths[0] ? line : line.trimStart()) + (r < text.length - 1 ? ' \\\\' : '')
  })
  const body = c.rows
    ? [`\\begin{quantikz}${options(...environment)}`, ...lines, '\\end{quantikz}'].join(
        '\n',
      )
    : '% The circuit has no wires.'
  const header = shareURL ? '% ' + shareURL + '\n' : ''
  return standalone
    ? header +
        `\\documentclass[border=6pt]{standalone}\n${PREAMBLE}\n\\begin{document}\n` +
        body +
        '\n\\end{document}\n'
    : header + body
}

// Importing quantikz source.

const stripComments = (source) =>
  source
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') i++
        else if (line[i] === '%') return line.slice(0, i)
      }
      return line
    })
    .join('\n')

// Reads a group opened at `start` ({ or [), returning its content and the
// index after the closing delimiter.
function readGroup(source, start) {
  const open = source[start],
    close = open === '{' ? '}' : ']'
  let depth = 0
  for (let i = start; i < source.length; i++) {
    const c = source[i]
    if (c === '\\') {
      i++
      continue
    }
    if (c === '{' || (open === '[' && c === '[')) depth++
    else if (c === '}' || (open === '[' && c === ']')) {
      if (c === close || c === '}') depth--
      if (depth === 0 && c === close)
        return {content: source.slice(start + 1, i), end: i + 1}
    }
  }
  throw new Error('Unbalanced braces in the circuit.')
}
const skipSpace = (source, i) => {
  while (i < source.length && /\s/.test(source[i])) i++
  return i
}

// Splits on a top-level separator: `&` for cells or `\\` for rows. Spacing
// arguments such as `\\[1cm]` and `&[2cm]` are dropped.
function split(source, separator) {
  const parts = []
  let depth = 0,
    start = 0
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (depth === 0 && separator === '&' && c === '&') {
      parts.push(source.slice(start, i))
      start = i + 1
      const next = skipSpace(source, start)
      if (source[next] === '[') start = readGroup(source, next).end
    } else if (c === '\\') {
      if (depth === 0 && separator === '\\\\' && source[i + 1] === '\\') {
        parts.push(source.slice(start, i))
        start = i + 2
        const next = skipSpace(source, start)
        if (source[next] === '[') start = readGroup(source, next).end
      }
      i++
    }
  }
  parts.push(source.slice(start))
  return parts
}

function splitOptions(source) {
  if (source == null) return []
  const parts = []
  let depth = 0,
    start = 0
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === ',' && depth === 0) {
      parts.push(source.slice(start, i))
      start = i + 1
    }
  }
  parts.push(source.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}
function readOptions(source) {
  const positional = [],
    keys = {}
  for (const part of splitOptions(source)) {
    const eq = part.indexOf('=')
    if (eq < 0) positional.push(part)
    else
      keys[part.slice(0, eq).trim()] = part
        .slice(eq + 1)
        .trim()
        .replace(/^\{(.*)\}$/s, '$1')
  }
  return {positional, keys}
}

const mandatory = {
  linethrough: 0,
  qw: 0,
  cw: 0,
}
// Parses a cell into commands with their optional and mandatory arguments.
// Plain math between commands becomes text on the wire, as quantikz shows it.
function readCell(source) {
  const list = []
  let i = 0,
    text = ''
  const flush = () => {
    const value = trim(text)
    if (value.replace(/[{}\s]/g, ''))
      list.push({name: 'text', options: null, args: [value]})
    text = ''
  }
  while (i < source.length) {
    if (source[i] !== '\\') {
      if (source[i] === '{') {
        const group = readGroup(source, i)
        text += '{' + group.content + '}'
        i = group.end
      } else text += source[i++]
      continue
    }
    const name = source.slice(i + 1).match(/^[a-zA-Z]+/)?.[0]
    if (!name || !commandNames.has(name)) {
      // Not a circuit command: keep it as part of a math label.
      const raw = name ? '\\' + name : source.slice(i, i + 2)
      text += raw
      i += raw.length
      continue
    }
    flush()
    i += name.length + 1
    const optional = []
    let next = skipSpace(source, i)
    while (source[next] === '[') {
      const group = readGroup(source, next)
      optional.push(group.content)
      next = skipSpace(source, (i = group.end))
    }
    const args = [],
      count = mandatory[name] ?? 1
    while (args.length < count && source[next] === '{') {
      const group = readGroup(source, next)
      args.push(group.content)
      next = skipSpace(source, (i = group.end))
    }
    list.push({name, options: optional[0] ?? null, optional, args})
  }
  flush()
  return list
}

const primary = {
  gate: 'gate',
  meter: 'meter',
  metercw: 'meter',
  measure: 'meter',
  meterD: 'meter',
  measuretab: 'meter',
  inputD: 'meter',
  ctrl: 'ctrl',
  octrl: 'octrl',
  control: 'ctrl',
  ocontrol: 'octrl',
  targ: 'targ',
  targX: 'swap',
  swap: 'swap',
  phase: 'phase',
  ground: 'ground',
  trash: 'trash',
  push: 'push',
  text: 'push',
  qwbundle: 'bundle',
}
// Layout helpers that do not change what the circuit shows.
const ignored = new Set([
  'ghost',
  'phantomgate',
  'hphantomgate',
  'linethrough',
  'qw',
  'cw',
])
const commandNames = new Set([
  ...Object.keys(primary),
  ...ignored,
  'lstick',
  'rstick',
  'midstick',
  'slice',
  'gategroup',
  'setwiretype',
  'wireoverride',
  'wire',
  'permute',
  'wave',
  'makeebit',
  'gateinput',
  'gateoutput',
  'vqw',
  'vcw',
])

// Reads a quantikz environment into an editable circuit. Commands the editor
// does not model are skipped and reported in `warnings`.
export function fromTeX(source) {
  const input = stripComments(source)
  const begin = input.match(/\\begin\{(quantikz|tikzcd)\}/)
  if (!begin) throw new Error('No quantikz environment found.')
  let position = skipSpace(input, begin.index + begin[0].length),
    environment = ''
  if (input[position] === '[') {
    const group = readGroup(input, position)
    environment = group.content
    position = group.end
  }
  const end = input.indexOf(`\\end{${begin[1]}}`, position)
  if (end < 0) throw new Error('The quantikz environment is not closed.')
  const rows = split(input.slice(position, end), '\\\\').map((row) =>
    split(row, '&').map(readCell),
  )
  // A final \\ leaves one empty row behind.
  if (rows.length > 1 && rows.at(-1).length === 1 && !rows.at(-1)[0].length) rows.pop()
  const warnings = new Set()
  const content = (cell) => cell.filter((x) => primary[x.name])
  const shift = rows.some((row) => content(row[0]).length) ? 1 : 0,
    width = Math.max(...rows.map((row) => row.length))
  const lastHasContent = rows.some(
    (row) => row.length === width && width > 1 && content(row[width - 1]).length,
  )
  const output = lastHasContent ? width : width - 1,
    cols = Math.max(1, output - 1 + shift),
    toCol = (m) => m - 1 + shift

  const env = readOptions(environment)
  const initial = splitOptions(env.keys['wire types'])
  const circuit = emptyCircuit(rows.length, cols)
  circuit.title = 'Imported circuit'
  const sep = (value) => {
    const match = value?.match(/^\{?\s*(-?[\d.]+)\s*cm/)
    return match ? number(match[1]) : null
  }
  if (env.keys['row sep'] && /between origins/.test(env.keys['row sep']))
    circuit.options.rowSep = sep(env.keys['row sep'])
  if (env.keys['column sep']) circuit.options.columnSep = sep(env.keys['column sep'])
  circuit.options.thinLines = env.positional.includes('thin lines')

  const verticals = []
  rows.forEach((row, r) => {
    const w = circuit.wires[r]
    let current = wireTypeIDs.includes(initial[r]) ? initial[r] : 'q'
    for (let k = 0; k <= cols; k++) {
      const m = k + 1 - shift,
        cell = m >= 1 && m < row.length ? row[m] : null
      if (!cell) {
        w.segments[k] = 'n'
        continue
      }
      let override = null
      for (const x of cell) {
        const type = x.args[0]?.trim()
        if (!wireTypeIDs.includes(type)) continue
        if (x.name === 'setwiretype' && !x.options) current = type
        if (x.name === 'wireoverride') override = type
      }
      if (cell.some((x) => x.name === 'inputD')) override = 'n'
      w.segments[k] = override || current
    }
    row.forEach((cell, m) => {
      const col = toCol(m)
      let placed = null
      for (const x of cell) {
        const opts = readOptions(x.options),
          arg = x.args[0] ?? ''
        const count = Number(
          opts.keys.wires ?? opts.positional.find((p) => /^\d+$/.test(p)),
        )
        if (x.name === 'lstick' || x.name === 'rstick') {
          const side = x.name === 'lstick' ? 'input' : 'output'
          w[side] = fromTextArgument(arg)
          w[side + 'Span'] = Math.max(1, Math.min(rows.length - r, count || 1))
        } else if (primary[x.name]) {
          if (placed || col < 0 || col >= cols) {
            warnings.add('\\' + x.name)
            continue
          }
          const kind = opts.positional.includes('open')
            ? {ctrl: 'octrl', control: 'octrl'}[x.name] || primary[x.name]
            : primary[x.name]
          const variant =
            kind === 'meter'
              ? meterStyles.some((s) => s.id === x.name)
                ? x.name
                : 'meterD'
              : null
          placed = item(kind, r, col, {
            value: ['ctrl', 'octrl', 'swap', 'targ', 'ground'].includes(kind)
              ? ''
              : trim(arg),
            span: count > 1 ? Math.min(count, rows.length - r) : 1,
            variant,
          })
          circuit.items.push(placed)
          if (['ctrl', 'octrl', 'swap'].includes(x.name)) {
            const offset = parseInt(arg, 10)
            if (offset)
              verticals.push({
                row: r,
                col,
                end: r + offset,
                type: opts.keys['vertical wire'] === 'c' ? 'c' : 'q',
              })
          }
        } else if (x.name === 'wire') {
          const direction = x.optional[0]?.trim(),
            length = parseInt(x.optional[1] ?? '1', 10) || 1,
            type = arg.trim() === 'c' ? 'c' : 'q'
          if (direction === 'd' || direction === 'u')
            verticals.push({
              row: r,
              col,
              end: r + (direction === 'd' ? length : -length),
              type,
            })
          else warnings.add('\\wire[' + direction + ']')
        } else if (x.name === 'slice') {
          if (col >= -1 && col < cols && !circuit.slices.some((s) => s.col === col))
            circuit.slices.push(slice(col, fromTextArgument(arg)))
        } else if (x.name === 'gategroup') {
          if (col >= 0 && col < cols)
            circuit.groups.push(
              group(
                r,
                col,
                Math.max(1, Math.min(rows.length - r, count || 1)),
                Math.max(1, Math.min(cols - col, Number(opts.keys.steps) || 1)),
                {
                  value: fromTextArgument(arg),
                  dashed: /dash/.test(opts.keys.style || ''),
                },
              ),
            )
        } else if (
          !['setwiretype', 'wireoverride'].includes(x.name) &&
          !ignored.has(x.name)
        )
          warnings.add('\\' + x.name)
      }
    })
  })

  // Each element holds one vertical wire. A second wire on the same element
  // moves to the element at its other end, or merges with an overlapping wire.
  const at = (row, col) =>
    circuit.items.find((i) => i.col === col && row >= i.row && row < i.row + spanOf(i))
  for (const v of verticals) {
    if (v.end < 0 || v.end >= rows.length || v.end === v.row) continue
    const own = at(v.row, v.col),
      other = at(v.end, v.col)
    const assign = (owner, from, to) => {
      owner.link = to - owner.row
      owner.linkType = v.type
    }
    if (own && !own.link) assign(own, v.row, v.end)
    else if (other && !other.link) assign(other, v.end, v.row)
    else {
      const lo = Math.min(v.row, v.end),
        hi = Math.max(v.row, v.end)
      const host = circuit.items.find((i) => {
        if (i.col !== v.col || !i.link) return false
        const a = Math.min(i.row, i.row + i.link),
          b = Math.max(i.row, i.row + i.link)
        return (
          a <= hi && lo <= b && (i.row === Math.min(a, lo) || i.row === Math.max(b, hi))
        )
      })
      if (!host) {
        warnings.add('\\wire')
        continue
      }
      const a = Math.min(host.row, host.row + host.link, lo),
        b = Math.max(host.row, host.row + host.link, hi)
      host.link = host.row === a ? b - host.row : a - host.row
    }
  }
  return {circuit: parseCircuit(circuit), warnings: [...warnings]}
}
