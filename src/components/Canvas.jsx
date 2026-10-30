import {useI18n} from './I18n'
import {h} from 'preact'
import {useEffect, useMemo, useRef, useState} from 'preact/hooks'
import CircuitScene, {ItemShape, GroupShape, sliceX, sliceExtent} from './CircuitScene'
import {ROW, FONT, gates, spans} from '../core/catalog.mjs'
import {bounds, measure, verticalExtent} from '../core/layout.mjs'
import {
  item as makeItem,
  slice as makeSlice,
  group as makeGroup,
  key,
  cellKey,
  selected,
  spanOf,
  place,
  updateItem,
  moveSelection,
  setSegments,
  normalize,
} from '../core/model.mjs'

// Screen distances: a click may wobble a little before it becomes a drag.
const CLICK = 4,
  HANDLE = 9
// New content may extend the circuit by a few wires or steps at a time. Wires
// and steps are inserted before existing ones from the inspector instead, so the
// circuit never shifts under the pointer.
const REACH = 4
const connectors = ['ctrl', 'octrl', 'swap']
const partner = {ctrl: 'targ', octrl: 'targ', swap: 'swap'}

// What the active component places, before it is given a cell.
export function draftItem(component, row = 0, col = 0) {
  const preset = gates.find((g) => g.id === component)
  if (preset) return makeItem('gate', row, col, {value: preset.value})
  return makeItem(component, row, col)
}

export default function Canvas({
  circuit: c,
  L,
  selection,
  onSelection,
  tool,
  component,
  panHeld,
  showGrid,
  insets,
  onPreview,
  onCommit,
  onEditLabel,
  fitToken,
  zoomAction,
  cancelToken,
  sceneRef,
  onZoom,
}) {
  const t = useI18n()
  const host = useRef(),
    gesture = useRef()
  const [size, setSize] = useState([900, 700])
  const [view, setView] = useState({x: 0, y: 0, zoom: 1})
  const [hover, setHover] = useState(null)
  const [marquee, setMarquee] = useState(null)
  const [ghost, setGhost] = useState(null)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize([entry.contentRect.width, entry.contentRect.height]),
    )
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    // Fit into the area left uncovered by the floating panels.
    const box = bounds(c, L, 40)
    const area = [
      Math.max(160, size[0] - insets.left - insets.right),
      Math.max(160, size[1] - insets.top - insets.bottom),
    ]
    const zoom = Math.max(0.2, Math.min(1.5, area[0] / box.width, area[1] / box.height))
    setView({
      x: insets.left + area[0] / 2 - size[0] / 2 - (box.x + box.width / 2) * zoom,
      y: insets.top + area[1] / 2 - size[1] / 2 - (box.y + box.height / 2) * zoom,
      zoom,
    })
  }, [fitToken, size])
  useEffect(() => onZoom(view.zoom), [view.zoom])
  useEffect(() => {
    if (zoomAction)
      setView((v) => {
        const zoom = Math.max(0.2, Math.min(4, v.zoom * zoomAction.factor)),
          ratio = zoom / v.zoom
        return {x: v.x * ratio, y: v.y * ratio, zoom}
      })
  }, [zoomAction])
  const reset = () => {
    gesture.current = null
    setMarquee(null)
    setGhost(null)
  }
  useEffect(() => {
    if (gesture.current?.original) onPreview(gesture.current.original)
    reset()
    setHover(null)
  }, [cancelToken, tool, component])

  const coordinates = (event) => {
    const rect = host.current.getBoundingClientRect()
    return [
      (event.clientX - rect.left - size[0] / 2 - view.x) / view.zoom,
      (event.clientY - rect.top - size[1] / 2 - view.y) / view.zoom,
    ]
  }
  const cellAt = ([x, y]) => ({row: L.rowAt(y), col: L.columnAt(x)})
  const inside = (row, col) => row >= 0 && row < c.rows && col >= 0 && col < c.cols
  const reachable = (row, col) =>
    row >= 0 && row < c.rows + REACH && col >= 0 && col < c.cols + 2 * REACH
  const groupBox = (g) => ({
    x0: L.boundary(g.col) + 6,
    x1: L.boundary(g.col + g.cols) - 6,
    y0: L.y(g.row) - ROW / 2 + 6,
    y1: L.y(g.row + g.rows - 1) + ROW / 2 - 6,
  })
  // The slice position nearest to x: the boundary after step `col`.
  const sliceAt = (x) => {
    const col = L.columnAt(x)
    return x < L.center(col) ? col - 1 : col
  }

  // Handles appear on a single selected element or group.
  const single = selection.length === 1 ? selection[0] : null
  const selectedItem =
    tool === 'select' && single?.startsWith('item:')
      ? c.items.find((i) => key('item', i.id) === single)
      : null
  const selectedGroup =
    tool === 'select' && single?.startsWith('group:')
      ? c.groups.find((g) => key('group', g.id) === single)
      : null
  const handles = []
  if (selectedItem) {
    const i = selectedItem,
      x = L.center(i.col),
      extent = verticalExtent(i)
    handles.push({
      type: 'link',
      id: i.id,
      point: [x, i.link ? L.y(i.row + i.link) : L.y(i.row) + extent.bottom + 12],
    })
    if (spans(i))
      handles.push({
        type: 'span',
        id: i.id,
        point: [x + L.shape(i).width / 2, L.y(i.row) + extent.bottom],
      })
  }
  if (selectedGroup) {
    const box = groupBox(selectedGroup)
    handles.push({type: 'group', id: selectedGroup.id, point: [box.x1, box.y1]})
  }

  // Hit testing is geometric: the cell under the pointer decides.
  const hit = (point) => {
    const [x, y] = point,
      tolerance = 6 / view.zoom
    for (const handle of handles)
      if (Math.hypot(x - handle.point[0], y - handle.point[1]) <= HANDLE / view.zoom)
        return {type: 'handle', handle}
    const {row, col} = cellAt(point)
    const extent = sliceExtent(L)
    for (const s of c.slices)
      if (
        Math.abs(x - sliceX(L, s)) <= tolerance &&
        y >= extent.top - 1.5 * FONT &&
        y <= extent.bottom
      )
        return {type: 'slice', id: s.id}
    if (inside(row, col)) {
      const i = L.at(row, col)
      if (i) return {type: 'item', id: i.id}
    }
    for (const g of c.groups) {
      const b = groupBox(g)
      const onBorder =
        x >= b.x0 - tolerance &&
        x <= b.x1 + tolerance &&
        y >= b.y0 - tolerance &&
        y <= b.y1 + tolerance &&
        (Math.abs(x - b.x0) <= tolerance ||
          Math.abs(x - b.x1) <= tolerance ||
          Math.abs(y - b.y0) <= tolerance ||
          Math.abs(y - b.y1) <= tolerance)
      const onLabel = g.value && y < b.y0 && y > b.y0 - 26 && x > b.x0 && x < b.x1
      if (onBorder || onLabel) return {type: 'group', id: g.id}
    }
    if (row >= 0 && row < c.rows && (x < L.boundary(0) || x > L.right)) {
      const side = x < L.boundary(0) ? 'input' : 'output'
      const owner = c.wires.findIndex(
        (w, r) => w[side] && r <= row && row < r + w[side + 'Span'],
      )
      return {type: side, row: owner >= 0 ? owner : row}
    }
    if (inside(row, col)) return {type: 'cell', row, col}
    return null
  }
  const targetKey = (target) =>
    !target
      ? null
      : target.type === 'cell'
        ? cellKey(target.row, target.col)
        : ['input', 'output'].includes(target.type)
          ? key(target.type, target.row)
          : key(target.type, target.id)

  // Placement previews for the active component.
  const placeAt = (base, cell, extra = {}) => {
    const element = {...draftItem(component, cell.row, cell.col), ...extra}
    return {circuit: place(base, element), id: element.id}
  }
  const connect = (base, start, row) => {
    const element = draftItem(component, start.row, start.col)
    element.link = row - start.row
    let next = place(base, element)
    if (element.link) {
      const end = start.row + element.link,
        existing = next.items.find(
          (i) => i.col === start.col && end >= i.row && end < i.row + spanOf(i),
        )
      if (!existing) next = place(next, makeItem(partner[component], end, start.col))
    }
    return {circuit: next, id: element.id}
  }

  const pointerDown = (event) => {
    if (event.button !== 0 && event.button !== 1) return
    host.current.setPointerCapture(event.pointerId)
    const point = coordinates(event),
      screen = [event.clientX, event.clientY]
    if (event.button === 1 || panHeld || tool === 'pan') {
      gesture.current = {type: 'pan', screen, view}
      return
    }
    const cell = cellAt(point)
    if (tool === 'place') {
      if (component.startsWith('wire-')) {
        const k = L.segmentAt(point[0])
        if (cell.row < 0 || cell.row >= c.rows || k < 0 || k > c.cols) return
        const type = component.slice(5),
          to = event.shiftKey ? c.cols : k
        gesture.current = {
          type: 'wire',
          row: cell.row,
          from: k,
          wire: type,
          shift: event.shiftKey,
          original: c,
        }
        onPreview(setSegments(c, cell.row, k, to, type))
        return
      }
      if (component === 'slice') {
        const col = sliceAt(point[0])
        if (col < -1 || col >= c.cols + 2 * REACH) return
        const existing = c.slices.find((s) => s.col === col)
        if (existing) {
          onSelection([key('slice', existing.id)])
          return
        }
        const s = makeSlice(col)
        onCommit(normalize({...c, slices: [...c.slices, s]}), [key('slice', s.id)])
        return
      }
      if (!reachable(cell.row, cell.col)) return
      if (component === 'group') {
        gesture.current = {type: 'group-draw', start: cell, end: cell, original: c}
        setGhost({group: makeGroup(cell.row, cell.col)})
        return
      }
      const original = c
      if (connectors.includes(component)) {
        gesture.current = {type: 'connect', start: cell, original}
        const result = connect(original, cell, cell.row)
        gesture.current.result = result
        onPreview(result.circuit)
      } else if (draftItem(component).kind === 'gate') {
        gesture.current = {type: 'gate', start: cell, original}
        const result = placeAt(original, cell)
        gesture.current.result = result
        onPreview(result.circuit)
      } else {
        const result = placeAt(original, cell)
        gesture.current = {
          type: 'paint',
          visited: new Set([`${cell.row}:${cell.col}`]),
          original,
          result,
        }
        onPreview(result.circuit)
      }
      setGhost(null)
      return
    }
    // Select tool.
    const target = hit(point)
    if (target?.type === 'handle') {
      gesture.current = {type: target.handle.type, id: target.handle.id, original: c}
      return
    }
    const id = targetKey(target)
    if (target && ['item', 'group', 'slice'].includes(target.type)) {
      const wasSelected = selection.includes(id)
      let next = selection
      if (event.shiftKey)
        next = wasSelected ? selection.filter((k) => k !== id) : [...selection, id]
      else if (!wasSelected) next = [id]
      onSelection(next)
      if (event.shiftKey && wasSelected) return
      gesture.current = {
        type: 'move',
        start: cell,
        sliceStart: sliceAt(point[0]),
        screen,
        selection: next,
        original: c,
        edit: wasSelected && !event.shiftKey && next.length === 1,
      }
      return
    }
    gesture.current = {
      type: 'marquee',
      start: point,
      screen,
      target,
      selection: event.shiftKey ? selection : [],
    }
  }

  const pointerMove = (event) => {
    const g = gesture.current,
      point = coordinates(event),
      cell = cellAt(point)
    if (!g) {
      updateHover(point, event)
      return
    }
    if (g.type === 'pan') {
      setView({
        ...g.view,
        x: g.view.x + event.clientX - g.screen[0],
        y: g.view.y + event.clientY - g.screen[1],
      })
    } else if (g.type === 'wire') {
      const k = Math.max(0, Math.min(c.cols, L.segmentAt(point[0])))
      onPreview(setSegments(g.original, g.row, g.from, g.shift ? c.cols : k, g.wire))
    } else if (g.type === 'gate') {
      const row = Math.max(0, Math.min(g.original.rows + REACH - 1, cell.row)),
        top = Math.min(g.start.row, row)
      g.result = placeAt(
        g.original,
        {row: top, col: g.start.col},
        {
          row: top,
          col: g.start.col,
          span: Math.abs(row - g.start.row) + 1,
        },
      )
      onPreview(g.result.circuit)
    } else if (g.type === 'connect') {
      const row = Math.max(0, Math.min(g.original.rows + REACH - 1, cell.row))
      g.result = connect(g.original, g.start, row)
      onPreview(g.result.circuit)
    } else if (g.type === 'paint') {
      const id = `${cell.row}:${cell.col}`
      if (g.visited.has(id) || !reachable(cell.row, cell.col)) return
      g.visited.add(id)
      g.result = placeAt(g.result.circuit, cell)
      onPreview(g.result.circuit)
    } else if (g.type === 'group-draw') {
      g.end = cell
      const row = Math.min(g.start.row, cell.row),
        col = Math.min(g.start.col, cell.col)
      setGhost({
        group: makeGroup(
          row,
          col,
          Math.abs(cell.row - g.start.row) + 1,
          Math.abs(cell.col - g.start.col) + 1,
        ),
      })
    } else if (g.type === 'move') {
      const rows = cell.row - g.start.row,
        onlySlices = g.selection.every((k) => k.startsWith('slice:')),
        cols = onlySlices ? sliceAt(point[0]) - g.sliceStart : cell.col - g.start.col
      if (rows === g.rows && cols === g.cols) return
      g.rows = rows
      g.cols = cols
      g.moved = g.moved || rows !== 0 || cols !== 0
      onPreview(
        moveSelection(g.original, g.selection, onlySlices ? 0 : rows, cols) || g.original,
      )
    } else if (g.type === 'link') {
      const i = g.original.items.find((x) => x.id === g.id)
      if (!i) return
      const row = Math.max(0, Math.min(g.original.rows + REACH - 1, cell.row))
      g.moved = true
      onPreview(updateItem(g.original, g.id, {link: row - i.row}))
    } else if (g.type === 'span') {
      const i = g.original.items.find((x) => x.id === g.id)
      if (!i) return
      const span = Math.max(
        1,
        Math.min(g.original.rows + REACH - i.row, cell.row - i.row + 1),
      )
      g.moved = true
      onPreview(updateItem(g.original, g.id, {span}))
    } else if (g.type === 'group') {
      const box = g.original.groups.find((x) => x.id === g.id)
      if (!box) return
      g.moved = true
      onPreview(
        normalize({
          ...g.original,
          groups: g.original.groups.map((x) =>
            x.id === g.id
              ? {
                  ...x,
                  rows: Math.max(
                    1,
                    Math.min(g.original.rows + REACH - x.row, cell.row - x.row + 1),
                  ),
                  cols: Math.max(
                    1,
                    Math.min(g.original.cols + REACH - x.col, cell.col - x.col + 1),
                  ),
                }
              : x,
          ),
        }),
      )
    } else if (g.type === 'marquee') {
      if (
        !g.dragging &&
        Math.hypot(event.clientX - g.screen[0], event.clientY - g.screen[1]) < CLICK
      )
        return
      g.dragging = true
      const box = {
        x0: Math.min(g.start[0], point[0]),
        x1: Math.max(g.start[0], point[0]),
        y0: Math.min(g.start[1], point[1]),
        y1: Math.max(g.start[1], point[1]),
      }
      setMarquee(box)
      const meets = (x0, x1, y0, y1) =>
        x0 < box.x1 && box.x0 < x1 && y0 < box.y1 && box.y0 < y1
      onSelection([
        ...new Set([
          ...g.selection,
          ...c.items
            .filter((i) => {
              const x = L.center(i.col),
                s = L.shape(i),
                e = verticalExtent(i)
              return meets(
                x - s.width / 2,
                x + s.width / 2,
                L.y(i.row) + e.top,
                L.y(i.row) + e.bottom,
              )
            })
            .map((i) => key('item', i.id)),
          ...c.groups
            .filter((x) => {
              const b = groupBox(x)
              return meets(b.x0, b.x1, b.y0, b.y1)
            })
            .map((x) => key('group', x.id)),
          ...c.slices
            .filter((s) => {
              const x = sliceX(L, s),
                e = sliceExtent(L)
              return meets(x - 1, x + 1, e.top, e.bottom)
            })
            .map((s) => key('slice', s.id)),
        ]),
      ])
    }
  }

  const pointerUp = (event) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.type === 'pan') return
    if (['gate', 'connect', 'paint'].includes(g.type)) {
      onCommit(g.result.circuit, [key('item', g.result.id)])
    } else if (g.type === 'wire') {
      onCommit()
    } else if (g.type === 'group-draw') {
      setGhost(null)
      const row = Math.min(g.start.row, g.end.row),
        col = Math.min(g.start.col, g.end.col)
      const box = makeGroup(
        row,
        col,
        Math.abs(g.end.row - g.start.row) + 1,
        Math.abs(g.end.col - g.start.col) + 1,
      )
      onCommit(normalize({...c, groups: [...c.groups, box]}), [key('group', box.id)])
    } else if (['move', 'link', 'span', 'group'].includes(g.type)) {
      if (g.moved) onCommit()
      else if (g.edit) onEditLabel()
    } else if (g.type === 'marquee') {
      setMarquee(null)
      if (g.dragging) return
      const id = targetKey(g.target)
      if (!id) onSelection(g.selection)
      else if (event.shiftKey)
        onSelection(
          g.selection.includes(id)
            ? g.selection.filter((k) => k !== id)
            : [...g.selection, id],
        )
      else if (selection.length === 1 && selection[0] === id) onEditLabel()
      else onSelection([id])
    }
  }

  const updateHover = (point, event) => {
    const cell = cellAt(point)
    if (tool === 'place') {
      if (component.startsWith('wire-')) {
        const k = L.segmentAt(point[0])
        setHover(
          cell.row >= 0 && cell.row < c.rows && k >= 0 && k <= c.cols
            ? {segment: {row: cell.row, k}}
            : null,
        )
      } else if (component === 'slice') {
        const col = sliceAt(point[0])
        setHover(col >= -1 && col < c.cols + 2 * REACH ? {slice: col} : null)
      } else setHover(reachable(cell.row, cell.col) ? {cell} : null)
      return
    }
    const target = tool === 'select' ? hit(point) : null
    setHover(target ? {target} : null)
  }

  const wheel = (event) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const zoom = Math.max(0.2, Math.min(4, view.zoom * Math.exp(-event.deltaY * 0.006)))
      const rect = host.current.getBoundingClientRect(),
        mx = event.clientX - rect.left - size[0] / 2,
        my = event.clientY - rect.top - size[1] / 2
      const ratio = zoom / view.zoom
      setView({zoom, x: mx - (mx - view.x) * ratio, y: my - (my - view.y) * ratio})
    } else setView((v) => ({...v, x: v.x - event.deltaX, y: v.y - event.deltaY}))
  }
  useEffect(() => {
    const element = host.current
    element.addEventListener('wheel', wheel, {passive: false})
    return () => element.removeEventListener('wheel', wheel)
  }, [view, size])

  const scene = useMemo(
    () => <CircuitScene circuit={c} L={L} sceneRef={sceneRef} />,
    [c, L],
  )

  const origin = [size[0] / 2 + view.x, size[1] / 2 + view.y]
  const transform = `translate(${origin[0]} ${origin[1]}) scale(${view.zoom})`
  // Quiver-style dashed grid along the cell boundaries, drawn in screen space.
  const grid = []
  if (showGrid) {
    const left = -origin[0] / view.zoom,
      right = (size[0] - origin[0]) / view.zoom,
      top = -origin[1] / view.zoom,
      bottom = (size[1] - origin[1]) / view.zoom
    const k0 = L.columnAt(left),
      k1 = L.columnAt(right) + 1,
      r0 = Math.floor(top / ROW + 0.5),
      r1 = Math.ceil(bottom / ROW + 0.5)
    const dash = (ROW * view.zoom) / 16
    let d = ''
    const sx = (x) => (origin[0] + x * view.zoom).toFixed(1),
      sy = (y) => (origin[1] + y * view.zoom).toFixed(1)
    const yTop = (r0 - 0.5) * ROW,
      yBottom = (r1 - 0.5) * ROW
    for (let k = k0; k <= k1; k++) d += `M${sx(L.boundary(k))} ${sy(yTop)}V${sy(yBottom)}`
    for (let r = r0; r <= r1; r++)
      d += `M${sx(L.boundary(k0))} ${sy((r - 0.5) * ROW)}H${sx(L.boundary(k1))}`
    grid.push(
      <path
        class="grid-line"
        d={d}
        fill="none"
        stroke-width={Math.max(1, 1.25 * view.zoom)}
        stroke-dasharray={dash}
        stroke-dashoffset={dash / 2}
      />,
    )
  }

  // Quiver-style highlights behind the circuit.
  const cellRect = (row, col, rows = 1, className, extra = {}) => (
    <rect
      class={className}
      x={L.boundary(col) + 3}
      y={L.y(row) - ROW / 2 + 3}
      width={L.boundary(col + 1) - L.boundary(col) - 6}
      height={rows * ROW - 6}
      rx={6}
      {...extra}
    />
  )
  const labelRect = (side, row, className) => {
    const w = c.wires[row]
    if (!w) return null
    // Cover the label and the stretch of wire next to it.
    const span = w[side + 'Span'] || 1,
      reach = Math.max(32, measure(w[side]).width + (span > 1 ? 28 : 18))
    const x0 = side === 'input' ? L.wireStart - reach : L.right + 3,
      x1 = side === 'input' ? L.boundary(0) - 3 : L.wireEnd + reach
    return (
      <rect
        class={className}
        x={x0}
        y={L.y(row) - ROW / 2 + 3}
        width={x1 - x0}
        height={span * ROW - 6}
        rx={6}
      />
    )
  }
  const under = []
  const over = []
  const highlight = (k, className) => {
    const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)]
    if (kind === 'item') {
      const i = c.items.find((x) => x.id === id)
      if (i) under.push(cellRect(i.row, i.col, spanOf(i), className))
    } else if (kind === 'cell') {
      const [row, col] = id.split(':').map(Number)
      under.push(cellRect(row, col, 1, className))
    } else if (kind === 'input' || kind === 'output') {
      under.push(labelRect(kind, Number(id), className))
    } else if (kind === 'group') {
      const g = c.groups.find((x) => x.id === id)
      if (g) {
        const b = groupBox(g)
        over.push(
          <rect
            class={`${className}-outline`}
            x={b.x0}
            y={b.y0}
            width={b.x1 - b.x0}
            height={b.y1 - b.y0}
            rx={4}
            stroke-width={6 / view.zoom}
          />,
        )
      }
    } else if (kind === 'slice') {
      const s = c.slices.find((x) => x.id === id)
      if (s) {
        const x = sliceX(L, s),
          e = sliceExtent(L)
        over.push(
          <path
            class={`${className}-outline`}
            d={`M${x} ${e.top}V${e.bottom}`}
            stroke-width={8 / view.zoom}
          />,
        )
      }
    }
  }
  for (const k of selection) highlight(k, 'cell-selected')
  const hoverKey = hover?.target ? targetKey(hover.target) : null
  if (hoverKey && !selection.includes(hoverKey) && hover.target.type !== 'handle')
    highlight(hoverKey, 'cell-hover')
  if (hover?.cell && tool === 'place' && !gesture.current) {
    const {row, col} = hover.cell
    if (component === 'group') under.push(cellRect(row, col, 1, 'cell-hover'))
    else {
      const element = draftItem(component, row, col)
      over.push(
        <g class="ghost">
          {row >= 0 && row < c.rows ? null : (
            <path
              d={`M${L.center(col) - ROW / 2} ${L.y(row)}H${L.center(col) + ROW / 2}`}
            />
          )}
          <ItemShape item={element} x={L.center(col)} y={L.y(row)} paper="white" />
        </g>,
      )
    }
  }
  if (hover?.segment && !gesture.current) {
    const {row, k} = hover.segment
    const x0 = k === 0 ? L.wireStart : L.exit(row, k - 1),
      x1 = k === c.cols ? L.wireEnd : L.entry(row, k)
    over.push(
      <path
        class="segment-hover"
        d={`M${x0} ${L.y(row)}H${x1}`}
        stroke-width={8 / view.zoom}
      />,
    )
  }
  if (hover?.slice != null && !gesture.current) {
    const x = L.boundary(hover.slice + 1),
      e = sliceExtent(L)
    over.push(
      <path class="slice-ghost" d={`M${x} ${e.top}V${e.bottom}`} stroke-width={2} />,
    )
  }
  if (ghost?.group)
    over.push(
      <g class="ghost">
        <GroupShape group={ghost.group} L={L} />
      </g>,
    )
  const hoverHandle = hover?.target?.type === 'handle' ? hover.target.handle : null
  const cursor = hoverHandle
    ? hoverHandle.type === 'group'
      ? ' cursor-resize'
      : ' cursor-vertical'
    : hover?.target && ['item', 'group', 'slice'].includes(hover.target.type)
      ? ' cursor-move'
      : ''
  return (
    <div
      ref={host}
      class={`canvas-host tool-${panHeld ? 'pan' : tool}${cursor}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerLeave={() => !gesture.current && setHover(null)}
      onPointerCancel={() => {
        if (gesture.current?.original) onPreview(gesture.current.original)
        reset()
      }}
      onDblClick={(event) => {
        if (tool !== 'select') return
        const target = hit(coordinates(event))
        if (target && target.type !== 'handle') {
          onSelection([targetKey(target)])
          onEditLabel()
        }
      }}
    >
      <svg
        class="circuit-canvas"
        aria-label={t('Circuit canvas')}
        width="100%"
        height="100%"
      >
        {grid}
        <g transform={transform}>
          <g class="interaction-under">{under}</g>
          {scene}
          <g class="interaction-over" fill="none">
            {over}
            {handles.map((handle) => (
              <circle
                class={`handle handle-${handle.type}`}
                data-handle={handle.type}
                cx={handle.point[0]}
                cy={handle.point[1]}
                r={(handle.type === 'link' ? 6 : 5) / view.zoom}
                stroke-width={2 / view.zoom}
              />
            ))}
            {marquee && (
              <rect
                class="marquee"
                x={marquee.x0}
                y={marquee.y0}
                width={marquee.x1 - marquee.x0}
                height={marquee.y1 - marquee.y0}
                stroke-width={1 / view.zoom}
              />
            )}
          </g>
        </g>
      </svg>
    </div>
  )
}
