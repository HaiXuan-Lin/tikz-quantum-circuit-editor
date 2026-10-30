import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyCircuit,
  item,
  slice,
  group,
  key,
  place,
  occupant,
  updateItem,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  resize,
  setSegments,
  setWireFrom,
  removeSelection,
  moveSelection,
  duplicateSelection,
  normalize,
  parseCircuit,
  History,
} from '../src/core/model.mjs'
import {templates} from '../src/core/templates.mjs'

const with_ = (circuit, ...items) => items.reduce((c, i) => place(c, i), circuit)

test('templates are valid circuits with unique identities', () => {
  for (const template of templates) {
    const circuit = template.create()
    assert.deepEqual(parseCircuit(JSON.stringify(circuit)), circuit, template.id)
    const ids = [
      ...circuit.items.map((i) => i.id),
      ...circuit.slices.map((s) => s.id),
      ...circuit.groups.map((g) => g.id),
    ]
    assert.equal(new Set(ids).size, ids.length, template.id)
    assert.notEqual(template.create().items[0].id, circuit.items[0].id)
    for (const w of circuit.wires) assert.equal(w.segments.length, circuit.cols + 1)
  }
})

test('placing replaces whatever covers the cells and grows the matrix', () => {
  let c = emptyCircuit(2, 2)
  const tall = item('gate', 0, 1, {value: 'U', span: 2})
  c = place(c, tall)
  assert.equal(occupant(c, 1, 1).id, tall.id)
  const h = item('gate', 1, 1, {value: 'H'})
  c = place(c, h)
  assert.deepEqual(
    c.items.map((i) => i.value),
    ['H'],
  )
  c = place(c, item('meter', 3, 4))
  assert.equal(c.rows, 4)
  assert.equal(c.cols, 5)
  assert.ok(c.wires.every((w) => w.segments.length === 6))
})

test('inserting and deleting wires keeps vertical wires, spans and labels attached', () => {
  let c = emptyCircuit(3, 3)
  const control = item('ctrl', 0, 1, {link: 2}),
    target = item('targ', 2, 1),
    tall = item('gate', 0, 2, {span: 2})
  c = with_(c, control, target, tall)
  c.wires[0] = {...c.wires[0], input: 'q', inputSpan: 2}
  const inserted = insertRow(c, 1)
  const at = (circuit, id) => circuit.items.find((i) => i.id === id)
  assert.equal(at(inserted, control.id).link, 3)
  assert.equal(at(inserted, target.id).row, 3)
  assert.equal(at(inserted, tall.id).span, 3)
  assert.equal(inserted.wires[0].inputSpan, 3)
  const removed = deleteRow(inserted, 1)
  assert.deepEqual(removed, c)
  // Deleting the target's wire pulls the vertical wire back to the next wire up.
  const shortened = deleteRow(c, 2)
  assert.equal(at(shortened, control.id).link, 1)
  assert.equal(
    shortened.items.some((i) => i.id === target.id),
    false,
  )
  // A control whose target wire goes away loses its vertical wire.
  const single = deleteRow(with_(emptyCircuit(2, 2), item('ctrl', 0, 0, {link: 1})), 1)
  assert.equal(single.items[0].link, 0)
})

test('inserting and deleting steps keeps wire types, slices and groups in place', () => {
  let c = emptyCircuit(1, 3)
  c = setSegments(c, 0, 2, 3, 'c')
  c = {...c, slices: [slice(1, 'a')], groups: [group(0, 0, 1, 2)]}
  const wider = insertColumn(c, 1)
  assert.deepEqual(wider.wires[0].segments, ['q', 'q', 'q', 'c', 'c'])
  assert.equal(wider.slices[0].col, 2)
  assert.equal(wider.groups[0].cols, 3)
  assert.deepEqual(deleteColumn(wider, 1), c)
  assert.deepEqual(resize(c, 2, 5).wires[1].segments, Array(6).fill('q'))
  assert.equal(resize(c, 2, 5).cols, 5)
})

test('wire types change from a segment to the end of its stretch', () => {
  let c = emptyCircuit(1, 5)
  c = setSegments(c, 0, 4, 5, 'n')
  c = setWireFrom(c, 0, 2, 'c')
  assert.deepEqual(c.wires[0].segments, ['q', 'q', 'c', 'c', 'n', 'n'])
})

test('moving refuses to land on other elements or leave the matrix', () => {
  const a = item('gate', 0, 0),
    b = item('gate', 0, 2)
  const c = with_(emptyCircuit(2, 3), a, b)
  assert.equal(moveSelection(c, [key('item', a.id)], 0, 2), null)
  assert.equal(moveSelection(c, [key('item', a.id)], -1, 0), null)
  const moved = moveSelection(c, [key('item', a.id)], 1, 1)
  assert.deepEqual(
    moved.items.map((i) => [i.row, i.col]),
    [
      [0, 2],
      [1, 1],
    ],
  )
  // Moving two neighbours together is fine.
  assert.ok(moveSelection(c, [key('item', a.id), key('item', b.id)], 0, 1))
})

test('duplicating copies the selected steps into new columns after them', () => {
  const h = item('gate', 0, 0, {value: 'H'}),
    cx = item('ctrl', 0, 1, {link: 1}),
    x = item('targ', 1, 1),
    m = item('meter', 0, 2)
  const c = with_(emptyCircuit(2, 3), h, cx, x, m)
  const result = duplicateSelection(c, [key('item', cx.id), key('item', x.id)])
  assert.equal(result.circuit.cols, 4)
  assert.equal(result.selection.length, 2)
  const copies = result.circuit.items.filter((i) =>
    result.selection.includes(key('item', i.id)),
  )
  assert.deepEqual(
    copies.map((i) => [i.kind, i.row, i.col, i.link]),
    [
      ['ctrl', 0, 2, 1],
      ['targ', 1, 2, 0],
    ],
  )
  assert.equal(result.circuit.items.find((i) => i.id === m.id).col, 3)
})

test('updating span or position re-places the element', () => {
  const a = item('gate', 0, 0),
    b = item('gate', 1, 0)
  const c = updateItem(with_(emptyCircuit(2, 1), a, b), a.id, {span: 2})
  assert.deepEqual(
    c.items.map((i) => i.id),
    [a.id],
  )
})

test('removing a selection clears labels, elements, slices and groups', () => {
  let c = with_(emptyCircuit(2, 2), item('gate', 0, 0))
  c = {...c, slices: [slice(0)], groups: [group(0, 0)]}
  c.wires[1] = {...c.wires[1], input: '\\ket{0}'}
  const removed = removeSelection(c, [
    key('item', c.items[0].id),
    key('slice', c.slices[0].id),
    key('group', c.groups[0].id),
    key('input', 1),
  ])
  assert.equal(removed.items.length + removed.slices.length + removed.groups.length, 0)
  assert.equal(removed.wires[1].input, '')
})

test('normalize prepends wires and steps for content above or left of the circuit', () => {
  const c = normalize({...emptyCircuit(1, 1), items: [item('gate', -1, -2)]})
  assert.equal(c.rows, 2)
  assert.equal(c.cols, 3)
  assert.deepEqual([c.items[0].row, c.items[0].col], [0, 0])
})

test('invalid projects fail or are clamped at the import boundary', () => {
  assert.throws(() => parseCircuit('{}'))
  assert.throws(() => parseCircuit({rows: 'x', cols: 2, items: []}))
  const c = parseCircuit({
    rows: 2,
    cols: 2,
    items: [
      {kind: 'gate', row: 0, col: 0, span: 9, link: 7},
      {kind: 'gate', row: 1, col: 0},
      {kind: 'nonsense', row: 0, col: 1},
      {kind: 'meter', row: 0, col: 1, variant: 'measure', span: 2},
      {kind: 'targ', row: 5, col: 0},
    ],
    wires: [{segments: ['q', 'x', 'c']}],
    slices: [{col: 0}, {col: 0}, {col: 7}],
    groups: [{row: 0, col: 0, rows: 9, cols: 9}],
  })
  assert.equal(c.items.length, 2)
  assert.equal(c.items[0].span, 2)
  assert.equal(c.items[0].link, 1)
  assert.equal(c.items[1].span, 1)
  assert.deepEqual(c.wires[0].segments, ['q', 'q', 'c'])
  assert.equal(c.slices.length, 1)
  assert.deepEqual([c.groups[0].rows, c.groups[0].cols], [2, 2])
})

test('history skips unchanged states and supports undo and redo', () => {
  const a = emptyCircuit(1, 1),
    b = emptyCircuit(2, 1)
  const history = new History(a)
  history.push(a)
  assert.equal(history.canUndo, false)
  history.push(b)
  assert.deepEqual(history.undo(), a)
  assert.deepEqual(history.redo(), b)
  assert.equal(history.canRedo, false)
})
