import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyCircuit, item, place} from '../src/core/model.mjs'
import {layout, bounds, remember, measure, shape} from '../src/core/layout.mjs'
import {COLUMN, COLUMN_GAP, ROW, PT, FONT} from '../src/core/catalog.mjs'

test('steps widen to fit their gates and keep the quantikz gap', () => {
  remember('R_z(\\theta)', FONT, {width: 80, height: 20})
  let c = emptyCircuit(2, 3)
  c = place(c, item('gate', 0, 1, {value: 'R_z(\\theta)'}))
  const L = layout(c)
  assert.equal(L.boundary(1), COLUMN)
  assert.equal(L.boundary(2) - L.boundary(1), Math.ceil(80 + 8 * PT + COLUMN_GAP))
  // Steps outside the circuit continue at the narrowest width.
  assert.equal(L.boundary(5) - L.boundary(4), COLUMN)
  assert.equal(L.boundary(-2), -2 * COLUMN)
  assert.equal(L.columnAt(L.center(1)), 1)
  assert.equal(L.columnAt(-1), -1)
  assert.equal(L.rowAt(ROW * 1.4), 1)
})

test('wires stop at the edges of gates but run through controls and targets', () => {
  remember('H', FONT, {width: 20, height: 15})
  let c = emptyCircuit(2, 2)
  c = place(c, item('gate', 0, 0, {value: 'H'}))
  c = place(c, item('ctrl', 0, 1, {link: 1}))
  c = place(c, item('targ', 1, 1))
  const L = layout(c)
  assert.equal(L.exit(0, 0), L.center(0) + (20 + 8 * PT) / 2)
  assert.equal(L.entry(0, 1), L.center(1))
  assert.equal(L.entry(1, 1), L.center(1))
  assert.equal(L.entry(1, 0), L.center(0))
})

test('segments are picked by the half of the step under the pointer', () => {
  const L = layout(emptyCircuit(1, 3))
  assert.equal(L.segmentAt(L.center(1) - 1), 1)
  assert.equal(L.segmentAt(L.center(1) + 1), 2)
  assert.equal(L.segmentAt(L.wireStart + 1), 0)
})

test('element sizes follow quantikz', () => {
  assert.equal(shape(item('meter', 0, 0)).width, 20 * PT)
  assert.equal(shape(item('meter', 0, 0)).height, 15 * PT)
  assert.equal(shape(item('gate', 0, 0, {value: ''})).width, 8 * PT)
  assert.ok(measure('\\text{unmeasured}').width > 0)
})

test('bounds include labels on both sides', () => {
  const c = emptyCircuit(1, 1)
  c.wires[0] = {...c.wires[0], input: 'a', output: 'b'}
  remember('a', FONT, {width: 30, height: 10})
  remember('b', FONT, {width: 40, height: 10})
  const L = layout(c),
    box = bounds(c, L)
  assert.equal(box.x, L.wireStart - 50)
  assert.equal(box.x + box.width, L.wireEnd + 60)
})
