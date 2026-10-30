import {h} from 'preact'
import MathLabel from './MathLabel'
import {
  ROW,
  PT,
  CM,
  FONT,
  SMALL_FONT,
  LINE,
  THIN,
  CLASSICAL_GAP,
} from '../core/catalog.mjs'
import {DOT, TARGET, METER, TRASH, measure, shape} from '../core/layout.mjs'
import {spanOf} from '../core/model.mjs'

const GAP = CLASSICAL_GAP
const f = (x) => Math.round(x * 100) / 100

// Parallel strands of a wire: one for quantum, two for classical, three for a bundle.
const strands = (type) =>
  type === 'c' ? [-GAP, GAP] : type === 'b' ? [-GAP, 0, GAP] : [0]
export function horizontal(type, x0, x1, y) {
  if (type === 'n' || x1 <= x0) return ''
  return strands(type)
    .map((d) => `M${f(x0)} ${f(y + d)}H${f(x1)}`)
    .join('')
}
export function vertical(type, x, y0, y1) {
  if (type === 'n') return ''
  return strands(type === 'c' ? 'c' : 'q')
    .map((d) => `M${f(x + d)} ${f(y0)}V${f(y1)}`)
    .join('')
}

// A curly brace from y0 to y1 whose tip points in `direction` (±1).
export function brace(x, y0, y1, direction) {
  const d = 5 * direction,
    m = (y0 + y1) / 2,
    q = Math.min(5, (y1 - y0) / 4)
  return (
    `M${f(x)} ${f(y0)}Q${f(x + d)} ${f(y0)} ${f(x + d)} ${f(y0 + q)}` +
    `V${f(m - q)}Q${f(x + d)} ${f(m)} ${f(x + 2 * d)} ${f(m)}` +
    `Q${f(x + d)} ${f(m)} ${f(x + d)} ${f(m + q)}` +
    `V${f(y1 - q)}Q${f(x + d)} ${f(y1)} ${f(x)} ${f(y1)}`
  )
}

// The meter dial: an arc bent left by 50° and a needle, as quantikz draws it.
function dial(x, y, width) {
  const sx = x - width / 2 + 0.1 * CM,
    ex = x + width / 2 - 0.1 * CM,
    sy = y + 0.06 * CM,
    d = 0.3915 * (ex - sx),
    a = (50 * Math.PI) / 180
  const tip = [ex, y - 0.2 * CM],
    tail = [x, y + 0.1 * CM]
  const angle = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]),
    head = 8 * 0.6 * PT
  const back = (side) => [
    tip[0] - head * Math.cos(angle) + side * 0.4 * head * Math.sin(angle),
    tip[1] - head * Math.sin(angle) - side * 0.4 * head * Math.cos(angle),
  ]
  return {
    arc:
      `M${f(sx)} ${f(sy)}C${f(sx + d * Math.cos(a))} ${f(sy - d * Math.sin(a))} ` +
      `${f(ex - d * Math.cos(a))} ${f(sy - d * Math.sin(a))} ${f(ex)} ${f(sy)}`,
    needle: `M${f(tail[0])} ${f(tail[1])}L${f(tip[0] - 0.7 * head * Math.cos(angle))} ${f(tip[1] - 0.7 * head * Math.sin(angle))}`,
    head: `M${f(tip[0])} ${f(tip[1])}L${back(1).map(f).join(' ')}L${back(-1).map(f).join(' ')}Z`,
  }
}

// One element drawn at the centre of its first cell. `span` extends tall gates.
export function ItemShape({item: i, x, y, ink = 'currentColor', paper = 'white'}) {
  const s = shape(i),
    span = spanOf(i),
    top = y - s.height / 2,
    bottom = y + (span - 1) * ROW + s.height / 2,
    middle = (top + bottom) / 2
  const label = (value, lx, ly, size = FONT) =>
    value?.trim() ? (
      <MathLabel value={value} x={lx} y={ly} size={size} color={ink} />
    ) : null
  const above = (value, edge) =>
    label(value, x, edge - 0.3333 * 10 * PT - measure(value).height / 2)
  switch (i.kind) {
    case 'gate':
      return (
        <g>
          <rect
            x={f(x - s.width / 2)}
            y={f(top)}
            width={f(s.width)}
            height={f(bottom - top)}
            class="paper"
            fill={paper}
          />
          {label(i.value, x, middle)}
        </g>
      )
    case 'meter': {
      if (
        i.variant === 'measure' ||
        i.variant === 'meterD' ||
        i.variant === 'measuretab'
      ) {
        const x0 = x - s.width / 2,
          x1 = x + s.width / 2,
          r = s.height / 2
        const d =
          i.variant === 'measure'
            ? `M${f(x0 + r)} ${f(top)}H${f(x1 - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x1 - r)} ${f(top + s.height)}H${f(x0 + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x0 + r)} ${f(top)}Z`
            : i.variant === 'meterD'
              ? `M${f(x0)} ${f(top)}H${f(x1 - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x1 - r)} ${f(top + s.height)}H${f(x0)}Z`
              : `M${f(x0)} ${f(y)}L${f(x0 + r)} ${f(top)}H${f(x1)}V${f(top + s.height)}H${f(x0 + r)}Z`
        const shift =
          i.variant === 'meterD' ? -r / 4 : i.variant === 'measuretab' ? r / 2 : 0
        return (
          <g>
            <path d={d} class="paper" fill={paper} />
            {label(i.value, x + shift, y)}
          </g>
        )
      }
      const parts = dial(x, middle, METER.width)
      return (
        <g>
          <rect
            x={f(x - METER.width / 2)}
            y={f(top)}
            width={f(METER.width)}
            height={f(bottom - top)}
            class="paper"
            fill={paper}
          />
          {i.variant === 'metercw' && (
            <path d={vertical('c', x, top, top - METER.height / 2)} />
          )}
          <path d={parts.arc} />
          <path d={parts.needle} />
          <path d={parts.head} fill={ink} stroke="none" />
          {above(i.value, i.variant === 'metercw' ? top - METER.height / 2 : top)}
        </g>
      )
    }
    case 'ctrl':
    case 'octrl':
    case 'phase':
      return (
        <g>
          <circle
            class={i.kind === 'octrl' ? 'paper' : null}
            cx={f(x)}
            cy={f(y)}
            r={f(DOT - LINE / 2)}
            fill={i.kind === 'octrl' ? paper : ink}
          />
          {/* quantikz centres the label 2mm out from the dot, at 45°. */}
          {i.kind === 'phase' &&
            label(
              i.value,
              x + (DOT + 0.2 * CM) * Math.SQRT1_2,
              y - (DOT + 0.2 * CM) * Math.SQRT1_2 - 2,
            )}
        </g>
      )
    case 'targ':
      return (
        <path
          d={`M${f(x)} ${f(y)}m${-TARGET} 0a${TARGET} ${TARGET} 0 1 0 ${2 * TARGET} 0a${TARGET} ${TARGET} 0 1 0 ${-2 * TARGET} 0M${f(x - TARGET)} ${f(y)}H${f(x + TARGET)}M${f(x)} ${f(y - TARGET)}V${f(y + TARGET)}`}
        />
      )
    case 'swap':
      return (
        <path
          d={`M${f(x - 7.5)} ${f(y - 6.6)}L${f(x + 7.5)} ${f(y + 6.6)}M${f(x - 7.5)} ${f(y + 6.6)}L${f(x + 7.5)} ${f(y - 6.6)}`}
        />
      )
    case 'ground': {
      const x0 = x - 3.9
      return (
        <path
          d={`M${f(x0)} ${f(y - 4 * GAP)}V${f(y + 4 * GAP)}M${f(x0 + 2 * GAP)} ${f(y - 3 * GAP)}V${f(y + 3 * GAP)}M${f(x0 + 4 * GAP)} ${f(y - 2 * GAP)}V${f(y + 2 * GAP)}`}
        />
      )
    }
    case 'trash': {
      const tip = y + TRASH.height / 2
      return (
        <g>
          <path d={`M${f(x - TRASH.width / 2)} ${f(y)}H${f(x)}V${f(tip - 4)}`} />
          <path
            d={`M${f(x)} ${f(tip)}l-3.2 -6.4l3.2 1.6l3.2 -1.6Z`}
            fill={ink}
            stroke="none"
          />
          {label(i.value, x, tip + 7.5 + measure(i.value).height / 2)}
        </g>
      )
    }
    case 'push':
      return label(i.value, x, y)
    case 'bundle': {
      const w = 0.08 * CM,
        hgt = 0.12 * CM
      return (
        <g>
          <path d={`M${f(x - w)} ${f(y + hgt)}L${f(x + w)} ${f(y - hgt)}`} />
          {label(
            i.value,
            x + w + measure(i.value, SMALL_FONT).width / 2,
            y - hgt - measure(i.value, SMALL_FONT).height / 2,
            SMALL_FONT,
          )}
        </g>
      )
    }
  }
  return null
}

export function GroupShape({group: g, L, ink = 'currentColor'}) {
  const x0 = L.boundary(g.col) + 6,
    x1 = L.boundary(g.col + g.cols) - 6,
    y0 = L.y(g.row) - ROW / 2 + 6,
    y1 = L.y(g.row + g.rows - 1) + ROW / 2 - 6
  return (
    <g class="circuit-group" data-kind="group" data-id={g.id}>
      <rect
        x={f(x0)}
        y={f(y0)}
        width={f(x1 - x0)}
        height={f(y1 - y0)}
        rx={g.dashed ? 4 * PT : 0}
        stroke-dasharray={g.dashed ? `${3 * PT} ${3 * PT}` : null}
      />
      {g.value?.trim() && (
        <MathLabel
          value={g.value}
          x={(x0 + x1) / 2}
          y={y0 - 0.2 * CM}
          size={FONT}
          color={ink}
        />
      )}
    </g>
  )
}

export function sliceX(L, s) {
  return L.boundary(s.col + 1)
}
export function sliceExtent(L) {
  return {top: -ROW / 2 + 10, bottom: L.y(Math.max(0, L.rows - 1)) + ROW / 2 - 6}
}

// The circuit as quantikz would typeset it. Interaction layers live in Canvas.
export default function CircuitScene({
  circuit: c,
  L,
  sceneRef,
  ink = '#000000',
  paper = 'white',
}) {
  const stroke = c.options.thinLines ? THIN : LINE
  const wires = c.wires.map((w, r) => {
    const y = L.y(r)
    let d = ''
    for (let k = 0; k <= c.cols; k++) {
      const x0 = k === 0 ? L.wireStart : L.exit(r, k - 1),
        x1 = k === c.cols ? L.wireEnd : L.entry(r, k)
      d += horizontal(w.segments[k], x0, x1, y)
    }
    return d ? <path class="wire" data-kind="wire" data-id={r} d={d} /> : null
  })
  const links = c.items
    .filter((i) => i.link)
    .map((i) => (
      <path
        class="vertical-wire"
        d={vertical(i.linkType, L.center(i.col), L.y(i.row), L.y(i.row + i.link))}
      />
    ))
  const extent = sliceExtent(L)
  // \lstick and \rstick labels, with a brace when they cover several wires.
  const labels = c.wires.flatMap((w, r) =>
    ['input', 'output'].map((side) => {
      const value = w[side],
        span = w[side + 'Span']
      if (!value?.trim()) return null
      const direction = side === 'input' ? -1 : 1,
        edge = side === 'input' ? L.wireStart : L.wireEnd,
        offset = span > 1 ? 18 : 8
      return (
        <g class="wire-label" data-kind={side} data-id={r}>
          {span > 1 && (
            <path
              d={brace(
                edge + direction * 6,
                L.y(r) - 8,
                L.y(r + span - 1) + 8,
                direction,
              )}
            />
          )}
          <MathLabel
            value={value}
            x={edge + direction * (offset + measure(value).width / 2)}
            y={L.y(r + (span - 1) / 2)}
            size={FONT}
            color={ink}
          />
        </g>
      )
    }),
  )
  return (
    <g
      ref={sceneRef}
      class="circuit-scene"
      stroke={ink}
      fill="none"
      stroke-width={stroke}
      color={ink}
    >
      <g class="groups">
        {c.groups.map((g) => (
          <GroupShape group={g} L={L} ink={ink} />
        ))}
      </g>
      <g class="wires">{wires}</g>
      <g class="vertical-wires">{links}</g>
      <g class="items">
        {c.items.map((i) => (
          <g class="circuit-item" data-kind="item" data-id={i.id}>
            <ItemShape
              item={i}
              x={L.center(i.col)}
              y={L.y(i.row)}
              ink={ink}
              paper={paper}
            />
          </g>
        ))}
      </g>
      <g class="slices">
        {c.slices.map((s) => {
          const x = sliceX(L, s)
          return (
            <g class="circuit-slice" data-kind="slice" data-id={s.id}>
              <path
                d={`M${f(x)} ${f(extent.top)}V${f(extent.bottom)}`}
                stroke="#ff0000"
                stroke-dasharray={`${5 * PT} ${3 * PT}`}
              />
              {s.value?.trim() && (
                <MathLabel
                  value={s.value}
                  x={x}
                  y={extent.top - 4 * PT - measure(s.value).height / 2}
                  size={FONT}
                  color={ink}
                />
              )}
            </g>
          )
        })}
      </g>
      <g class="labels">{labels}</g>
    </g>
  )
}
